#include "whisper.h"

#include <emscripten.h>
#include <emscripten/bind.h>

#include <sstream>
#include <thread>
#include <variant>
#include <vector>

using CallHandlerArg = std::variant<std::string, int, bool>;

// thread stuff
std::thread g_worker;
struct whisper_context {};
struct whisper_context *g_context = nullptr;

std::atomic<bool> abort_flag(false);
std::atomic<bool> is_running(false);

// stream stuff
std::thread g_stream_worker;
struct whisper_context *g_stream_context = nullptr;
std::mutex g_mutex;
std::atomic<bool> g_stream_running(false);
std::vector<float> g_pcmf32;

static inline int mpow2(int n) {
  int p = 1;
  while (p <= n)
    p *= 2;
  return p / 2;
}

//  500 -> 00:05.000
// 6000 -> 01:00.000
std::string to_timestamp(int64_t t, bool comma = false) {
  int64_t msec = t * 10;
  int64_t hr = msec / (1000 * 60 * 60);
  msec = msec - hr * (1000 * 60 * 60);
  int64_t min = msec / (1000 * 60);
  msec = msec - min * (1000 * 60);
  int64_t sec = msec / 1000;
  msec = msec - sec * 1000;

  char buf[32];
  snprintf(buf, sizeof(buf), "%02d:%02d:%02d%s%03d", (int)hr, (int)min,
           (int)sec, comma ? "," : ".", (int)msec);

  return std::string(buf);
}

char *escape_double_quotes_and_backslashes(const char *str) {
  if (str == NULL) {
    return NULL;
  }

  size_t escaped_length = strlen(str) + 1;

  for (size_t i = 0; str[i] != '\0'; i++) {
    if (str[i] == '"' || str[i] == '\\') {
      escaped_length++;
    }
  }

  char *escaped = (char *)calloc(escaped_length, 1); // pre-zeroed
  if (escaped == NULL) {
    return NULL;
  }

  size_t pos = 0;
  for (size_t i = 0; str[i] != '\0'; i++) {
    if (str[i] == '"' || str[i] == '\\') {
      escaped[pos++] = '\\';
    }
    escaped[pos++] = str[i];
  }

  // no need to set zero due to calloc() being used prior

  return escaped;
}

bool isJson(const std::string &str) {
  return (str.front() == '{' && str.back() == '}') ||
         (str.front() == '[' && str.back() == ']');
}

std::string to_output_json(struct whisper_context *ctx, const int n_segment_0,
                           const int n_segment_1, bool is_segment = false) {

  std::stringstream json;

  auto start_arr = [&](const char *name) { json << "\"" << name << "\": ["; };

  auto end_arr = [&](bool end) { json << (end ? "]" : "],"); };

  auto start_obj = [&](const char *name) {
    if (name) {
      json << "\"" << name << "\": {";
    } else {
      json << "{";
    }
  };

  auto end_obj = [&](bool end) { json << (end ? "}" : "},"); };

  auto start_value = [&](const char *name) { json << "\"" << name << "\": "; };

  auto value_s = [&](const char *name, const char *val, bool end) {
    start_value(name);
    char *val_escaped = escape_double_quotes_and_backslashes(val);
    json << "\"" << val_escaped << (end ? "\"" : "\",");
    free(val_escaped);
  };

  auto end_value = [&](bool end) { json << (end ? "" : ","); };

  auto value_i = [&](const char *name, const int64_t val, bool end) {
    start_value(name);
    json << val;
    end_value(end);
  };

  auto value_f = [&](const char *name, const float val, bool end) {
    start_value(name);
    json << val;
    end_value(end);
  };

  auto value_b = [&](const char *name, const bool val, bool end) {
    start_value(name);
    json << (val ? "true" : "false");
    end_value(end);
  };

  auto times_o = [&](int64_t t0, int64_t t1, bool end) {
    start_obj("timestamps");
    value_s("from", to_timestamp(t0, true).c_str(), false);
    value_s("to", to_timestamp(t1, true).c_str(), true);
    end_obj(false);
    start_obj("offsets");
    value_i("from", t0 * 10, false);
    value_i("to", t1 * 10, true);
    end_obj(end);
  };

  auto times_single_o = [&](const char *name, int64_t t0, bool end) {
    start_obj(name);
    value_s("timestamp", to_timestamp(t0, true).c_str(), false);
    value_i("offset", t0 * 10, false);
    end_obj(end);
  };

  start_obj(nullptr);
  start_obj("result");
  value_s("language", whisper_lang_str(whisper_full_lang_id(ctx)), true);
  end_obj(false);

  if (is_segment) {
    start_obj("segment");
  } else {
    start_arr("transcription");
  }
  for (int i = n_segment_0; i < n_segment_1; ++i) {
    const char *text = whisper_full_get_segment_text(ctx, i);

    const int64_t t0 = whisper_full_get_segment_t0(ctx, i);
    const int64_t t1 = whisper_full_get_segment_t1(ctx, i);

    if (!is_segment) {
      start_obj(nullptr);
    }
    times_o(t0, t1, false);
    value_s("text", text, false);

    start_arr("tokens");
    const int n = whisper_full_n_tokens(ctx, i);
    for (int j = 0; j < n; ++j) {
      auto token = whisper_full_get_token_data(ctx, i, j);
      start_obj(nullptr);
      value_s("text", whisper_token_to_str(ctx, token.id), false);
      if (token.t0 > -1 && token.t1 > -1) {
        // If we have per-token timestamps, write them out
        times_o(token.t0, token.t1, false);
      }
      value_i("id", token.id, false);
      value_f("p", token.p, token.t_dtw <= -1);
      if (token.t_dtw > -1) {
        times_single_o("dtw", token.t_dtw, true);
      }
      end_obj(j == (n - 1));
    }
    end_arr(true);

    if (!is_segment) {
      end_obj(i == (n_segment_1 - 1));
    }
  }

  if (is_segment) {
    end_obj(true);
  } else {
    end_arr(true);
  }

  end_obj(true);

  return json.str();
}

template <typename... Args>
void call_handler(const std::string &handler, Args... args) {
  std::vector<CallHandlerArg> argsVector = {args...};

  std::stringstream script;
  script << "postMessage({cmd: \"callHandler\", handler: \"" << handler
         << "\", args: [";

  for (size_t i = 0; i < argsVector.size(); ++i) {
    if (i != 0)
      script << ", ";

    std::visit(
        [&](auto &&arg) {
          using T = std::decay_t<decltype(arg)>;
          if constexpr (std::is_same_v<T, std::string>)
            script << (isJson(arg) ? arg : "\"" + arg + "\"");
          else
            script << arg;
        },
        argsVector[i]);
  }

  script << "]})";

  emscripten_run_script(script.str().c_str());
  fflush(stdout);
}

void stream_set_status(const std::string &status) {
  static std::string last_status; // Store the last status

  std::lock_guard<std::mutex> lock(g_mutex);

  if (status != last_status) { // Only call handler if status has changed
    last_status = status;
    call_handler("onStreamStatus", status);
  }
}

/**
 * Callbacks
 */
void progress_callback(struct whisper_context * /*ctx*/,
                       struct whisper_state * /*state*/, int progress,
                       void *user_data) {
  printf("Progrees: %d\n", progress);
  call_handler("onProgress", progress);
}

void new_segment_callback(struct whisper_context *ctx,
                          struct whisper_state *state, int n_new,
                          void *user_data) {

  // get number of segments
  const int n_segment_1 = whisper_full_n_segments(ctx);
  const int n_segment_0 = n_segment_1 - n_new;

  printf("New Segment: %d - %d\n", n_segment_0, n_segment_1);

  const std::string result_json =
      to_output_json(ctx, n_segment_0, n_segment_1, true);

  call_handler("onNewSegment", result_json);
}

// the callback is called before every encoder run - if it returns false, the
// processing is aborted
bool encoder_begin_callback(struct whisper_context * /*ctx*/,
                            struct whisper_state * /*state*/, void *user_data) {
  printf("Called encoder_begin_callback() \n");
  bool is_aborted = *(bool *)user_data;
  return !is_aborted;
}

// the callback is called before every computation - if it returns true, the
// computation is aborted
bool abort_callback(void *user_data) {
  bool is_aborted = *(bool *)user_data;
  return is_aborted;
}

/**
 * Emscripten bindings
 */
void bind_init(const std::string &path_model, const std::string &dtw) {
  if (g_worker.joinable()) {
    g_worker.join();
  }

  if (g_context == nullptr) {
    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;

    if (dtw == "tiny" || dtw == "tiny.en" || dtw == "base" ||
        dtw == "base.en" || dtw == "small" || dtw == "small.en") {
      cparams.dtw_token_timestamps = true;
      cparams.dtw_aheads_preset = WHISPER_AHEADS_NONE;

      if (dtw == "tiny")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_TINY;
      if (dtw == "tiny.en")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_TINY_EN;
      if (dtw == "base")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_BASE;
      if (dtw == "base.en")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_BASE_EN;
      if (dtw == "small")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_SMALL;
      if (dtw == "small.en")
        cparams.dtw_aheads_preset = WHISPER_AHEADS_SMALL_EN;

      if (cparams.dtw_aheads_preset == WHISPER_AHEADS_NONE) {
        fprintf(stderr, "error: unknown DTW preset '%s'\n", dtw.c_str());
      }

      printf("Using DTW preset: %s\n", dtw.c_str());
    }

    g_context = whisper_init_from_file_with_params(path_model.c_str(), cparams);
    whisper_free_context_params(&cparams);
  }
}

void bind_free() {
  if (g_worker.joinable()) {
    g_worker.join();
  }

  whisper_free(g_context);
  g_context = nullptr;
}

// return is_running state for handle in JS code
// if is_running is true, wait for onCanceled message from worker
int bind_cancel() {
  abort_flag = true;
  return is_running;
}

int bind_transcribe(const emscripten::val &audio, const std::string &lang,
                    int nthreads, bool translate, int max_len,
                    bool split_on_word, bool suppress_non_speech_tokens) {

  if (g_worker.joinable()) {
    g_worker.join();
  }

  if (g_context == nullptr) {
    return -1;
  }

  // reset abort flag
  abort_flag = false;
  is_running = false;

  // whisper parameter
  struct whisper_full_params wparams = whisper_full_default_params(
      whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);

  // set language to auto if not supported
  std::string language;

  if (!whisper_is_multilingual(g_context)) {
    printf("Model does not support multiple languages\n");
    language = "en";
    wparams.translate = false;
  } else if (lang != "auto" && whisper_lang_id(lang.c_str()) == -1) {
    printf("Language not supported: %s\n", lang.c_str());
    language = "auto";
    wparams.detect_language = true;
    wparams.translate = translate;
  } else {
    language = lang;
    wparams.detect_language = false;
    wparams.translate = translate;
    printf("Language: %s\n", language.c_str());
  }

  wparams.language = language.c_str();

  wparams.print_realtime = false;
  wparams.print_progress = false;
  wparams.print_timestamps = false;
  wparams.print_special = false;

  wparams.n_threads = std::min(
      nthreads, std::min(16, mpow2(std::thread::hardware_concurrency())));
  wparams.offset_ms = 0;

  wparams.token_timestamps = true;
  wparams.max_len = max_len;
  wparams.split_on_word = split_on_word;
  wparams.suppress_non_speech_tokens = suppress_non_speech_tokens;

  // audio data
  std::vector<float> pcmf32;
  const int n = audio["length"].as<int>();

  emscripten::val heap = emscripten::val::module_property("HEAPU8");
  emscripten::val memory = heap["buffer"];

  pcmf32.resize(n);

  emscripten::val memoryView = audio["constructor"].new_(
      memory, reinterpret_cast<uintptr_t>(pcmf32.data()), n);
  memoryView.call<void>("set", audio);

  // callbacks
  wparams.progress_callback = progress_callback;
  wparams.new_segment_callback = new_segment_callback;

  wparams.encoder_begin_callback = encoder_begin_callback;
  wparams.encoder_begin_callback_user_data = &abort_flag;

  wparams.abort_callback = abort_callback;
  wparams.abort_callback_user_data = &abort_flag;

  // print system information
  {
    printf("system_info: n_threads = %d / %d | %s\n", wparams.n_threads,
           std::thread::hardware_concurrency(), whisper_print_system_info());

    printf("%s: processing %d samples, %.1f sec, %d threads, %d processors, "
           "lang = %s, task = %s, max_len=%i, split_on_word=%d, "
           "suppress_non_speech_tokens=%d ...\n",
           __func__, int(pcmf32.size()),
           float(pcmf32.size()) / WHISPER_SAMPLE_RATE, wparams.n_threads, 1,
           wparams.language, wparams.translate ? "translate" : "transcribe",
           wparams.max_len, wparams.split_on_word,
           wparams.suppress_non_speech_tokens);

    printf("\n");
  }

  // run the worker
  {
    g_worker = std::thread(
        [wparams = std::move(wparams), pcmf32 = std::move(pcmf32)]() {
          is_running = true;

          printf("running whisper_full ...\n");
          whisper_full(g_context, wparams, pcmf32.data(), pcmf32.size());
          printf("running whisper_full done\n");

          // get segements
          const int n_segments = whisper_full_n_segments(g_context);
          std::string result = to_output_json(g_context, 0, n_segments);

          if (!abort_flag) {
            call_handler("onTranscribed", result);
          } else {
            printf("call onCanceled in thread \n");
            call_handler("onCanceled");
          }

          is_running = false;
        });
  }

  return 0;
}

void stream_main(const std::string &lang, int nthreads, bool translate,
                 int max_tokens, int audio_ctx,
                 bool suppress_non_speech_tokens) {
  stream_set_status("loading");

  struct whisper_full_params wparams = whisper_full_default_params(
      whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);

  wparams.n_threads =
      std::min(nthreads, (int)std::thread::hardware_concurrency());
  wparams.offset_ms = 0;
  wparams.translate = translate;
  wparams.no_context = true;
  wparams.single_segment = true;
  wparams.print_realtime = false;
  wparams.print_progress = false;
  wparams.print_timestamps = false;
  wparams.print_special = false;
  wparams.no_timestamps = true;

  wparams.max_tokens = max_tokens;
  wparams.audio_ctx =
      audio_ctx; // partial encoder context for better performance

  // disable temperature fallback
  wparams.temperature_inc = 0.0f;
  wparams.prompt_tokens = nullptr;
  wparams.prompt_n_tokens = 0;

  wparams.language = lang.c_str();
  wparams.suppress_non_speech_tokens = suppress_non_speech_tokens;

  printf("stream: using %d threads\n", wparams.n_threads);

  std::vector<float> pcmf32;

  while (g_stream_running) {
    stream_set_status("waiting");

    {
      std::unique_lock<std::mutex> lock(g_mutex);

      if (g_pcmf32.size() < 1024) {
        lock.unlock();

        std::this_thread::sleep_for(std::chrono::milliseconds(10));

        continue;
      }

      pcmf32 = g_pcmf32;
      g_pcmf32.clear();
    }

    {
      const auto t_start = std::chrono::high_resolution_clock::now();

      stream_set_status("processing");

      int ret =
          whisper_full(g_stream_context, wparams, pcmf32.data(), pcmf32.size());
      if (ret != 0) {
        printf("whisper_full() failed: %d\n", ret);
        break;
      }

      const auto t_end = std::chrono::high_resolution_clock::now();

      printf("stream: whisper_full() returned %d in %f seconds\n", ret,
             std::chrono::duration<double>(t_end - t_start).count());
    }

    {
      std::string result_json;

      {
        const int n_segments = whisper_full_n_segments(g_stream_context);
        if (n_segments > 0) {
          result_json = to_output_json(g_stream_context, 0, n_segments, true);
        }
      }

      {
        std::lock_guard<std::mutex> lock(g_mutex);
        call_handler("onStreamTranscription", result_json);
      }
    }
  }

  whisper_free(g_stream_context);
  g_stream_context = nullptr;

  call_handler("onStreamStatus", "stopped");
}

// Stream
void bind_start_stream(const std::string &model, const std::string &lang,
                       int nthreads = 16, bool translate = false,
                       int max_tokens = 32, int audio_ctx = 512,
                       bool suppress_non_speech_tokens = false) {
  if (g_stream_context == nullptr) {
    struct whisper_context_params cparams = whisper_context_default_params();
    g_stream_context =
        whisper_init_from_file_with_params(model.c_str(), cparams);

    if (g_stream_context != nullptr) {
      g_stream_running = true;

      if (g_stream_worker.joinable()) {
        g_stream_worker.join();
      }
      g_stream_worker = std::thread([lang, nthreads, translate, max_tokens,
                                     audio_ctx, suppress_non_speech_tokens]() {
        stream_main(lang, nthreads, translate, max_tokens, audio_ctx,
                    suppress_non_speech_tokens);
      });
    }

    whisper_free_context_params(&cparams);
  }
}

void bind_stop_stream() {
  if (g_stream_running) {
    g_stream_running = false;
  }

  printf("stream stopped\n");
}

void bind_set_stream_audio(const emscripten::val &audio) {
  std::lock_guard<std::mutex> lock(g_mutex);
  const int n = audio["length"].as<int>();

  emscripten::val heap = emscripten::val::module_property("HEAPU8");
  emscripten::val memory = heap["buffer"];

  g_pcmf32.resize(n);

  emscripten::val memoryView = audio["constructor"].new_(
      memory, reinterpret_cast<uintptr_t>(g_pcmf32.data()), n);
  memoryView.call<void>("set", audio);
}

EMSCRIPTEN_BINDINGS(whisper) {
  emscripten::function("init", &bind_init);
  emscripten::function("free", &bind_free);
  emscripten::function("transcribe", &bind_transcribe);
  emscripten::function("cancel", &bind_cancel);

  emscripten::function("startStream", &bind_start_stream);
  emscripten::function("stopStream", &bind_stop_stream);
  emscripten::function("setStreamAudio", &bind_set_stream_audio);
}
