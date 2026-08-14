#include "whisper.h"

#include <emscripten.h>
#include <emscripten/bind.h>

#include <atomic>
#include <memory>
#include <mutex>
#include <sstream>
#include <thread>
#include <variant>
#include <vector>

using CallHandlerArg = std::variant<std::string, int, bool>;

// Sole owner of a whisper_context; whisper_free() runs automatically when the
// owning WhisperContextPtr is reset or destroyed.
struct WhisperContextDeleter {
  void operator()(whisper_context *ctx) const { whisper_free(ctx); }
};
using WhisperContextPtr = std::unique_ptr<whisper_context, WhisperContextDeleter>;

// Wraps a std::thread so replacing or destroying it always joins whatever
// thread it currently holds, instead of relying on every call site to
// remember to join-before-reassign.
class JoiningThread {
public:
  JoiningThread() = default;
  JoiningThread(const JoiningThread &) = delete;
  JoiningThread &operator=(const JoiningThread &) = delete;
  ~JoiningThread() { join(); }

  template <typename Fn> void start(Fn &&fn) {
    join();
    thread_ = std::thread(std::forward<Fn>(fn));
  }

  void join() {
    if (thread_.joinable()) {
      thread_.join();
    }
  }

private:
  std::thread thread_;
};

// thread stuff
JoiningThread g_worker;
struct whisper_context {};
WhisperContextPtr g_context;

std::atomic<bool> abort_flag(false);
std::atomic<bool> is_running(false);

// stream stuff
JoiningThread g_stream_worker;
WhisperContextPtr g_stream_context;
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
                           const int n_segment_1, bool is_segment = false,
                           bool include_vad_segments = false) {

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
    // Leave a trailing comma when a vad_segments field will follow.
    end_arr(!include_vad_segments);
  }

  if (!is_segment && include_vad_segments) {
    const int n_vad = whisper_full_n_vad_segments(ctx);
    start_arr("vad_segments");
    for (int i = 0; i < n_vad; ++i) {
      start_obj(nullptr);
      times_o(whisper_full_get_vad_segment_t0(ctx, i),
              whisper_full_get_vad_segment_t1(ctx, i), true);
      end_obj(i == (n_vad - 1));
    }
    end_arr(true);
  }

  end_obj(true);

  return json.str();
}

template <typename... Args>
void call_handler(const std::string &handler, Args... args) {
  emscripten::val argsArray = emscripten::val::array();
  std::vector<CallHandlerArg> argsVector = {args...};

  for (const auto &arg : argsVector) {
    std::visit(
        [&](auto &&val) {
          using T = std::decay_t<decltype(val)>;
          if constexpr (std::is_same_v<T, std::string>) {
            if (isJson(val)) {
              // Parse JSON string to object
              emscripten::val JSON = emscripten::val::global("JSON");
              argsArray.call<void>("push",
                                   JSON.call<emscripten::val>("parse", val));
            } else {
              argsArray.call<void>("push", val);
            }
          } else {
            argsArray.call<void>("push", val);
          }
        },
        arg);
  }

#ifdef SHOUT_USE_WEBGPU
  // The WebGPU build runs whisper_full inline on the main thread (GPU objects
  // cannot cross pthread boundaries), so the postMessage -> worker.onmessage ->
  // Module[handler] round-trip used by the pthread build does not exist here:
  // `self` is `window`, and a message posted to it has no listener. Invoke the
  // handler on the Module object directly instead.
  emscripten::val handlerFn = emscripten::val::module_property(handler.c_str());

  if (handlerFn.isUndefined() || handlerFn.isNull()) {
    printf("call_handler: Module.%s is not defined\n", handler.c_str());
    return;
  }

  handlerFn.call<void>("apply", emscripten::val::null(), argsArray);
#else
  emscripten::val global = emscripten::val::global("self");
  if (global["postMessage"].isUndefined()) {
    return;
  }

  emscripten::val message = emscripten::val::object();
  message.set("cmd", "callHandler");
  message.set("handler", handler);
  message.set("args", argsArray);
  global.call<void>("postMessage", message);
#endif
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
void apply_dtw_preset(struct whisper_context_params &cparams, const std::string &dtw) {
  if (dtw != "tiny" && dtw != "tiny.en" && dtw != "base" && dtw != "base.en" &&
      dtw != "small" && dtw != "small.en") {
    return;
  }

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

void bind_init(const std::string &path_model, const std::string &dtw) {
  g_worker.join();

  if (g_context) {
    return;
  }

  struct whisper_context_params cparams = whisper_context_default_params();
#ifdef SHOUT_USE_WEBGPU
  cparams.use_gpu = true;
#else
  cparams.use_gpu = false;
#endif

  apply_dtw_preset(cparams, dtw);

  g_context.reset(whisper_init_from_file_with_params(path_model.c_str(), cparams));
  whisper_free_context_params(&cparams);
}

void bind_free() {
  g_worker.join();
  g_context.reset();
}

// return is_running state for handle in JS code
// if is_running is true, wait for onCanceled message from worker
int bind_cancel() {
  abort_flag = true;
  return is_running;
}

void copy_audio_to_pcm(const emscripten::val &audio, std::vector<float> &dest) {
  const int n = audio["length"].as<int>();

  emscripten::val heap = emscripten::val::module_property("HEAPU8");
  emscripten::val memory = heap["buffer"];

  dest.resize(n);

  emscripten::val memoryView = audio["constructor"].new_(
      memory, reinterpret_cast<uintptr_t>(dest.data()), n);
  memoryView.call<void>("set", audio);
}

// Resolves the requested language against the model's capabilities, mutating
// the relevant whisper_full_params fields, and returns the language actually
// selected (kept alive by the caller for the lifetime of wparams.language).
std::string resolve_transcribe_language(whisper_context *ctx, const std::string &lang,
                                        bool translate, struct whisper_full_params &wparams) {
  std::string language;

  if (!whisper_is_multilingual(ctx)) {
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

  return language;
}

void log_transcribe_start(const struct whisper_full_params &wparams, size_t n_samples) {
  printf("system_info: n_threads = %d / %d | %s\n", wparams.n_threads,
         std::thread::hardware_concurrency(), whisper_print_system_info());

  printf("bind_transcribe: processing %d samples, %.1f sec, %d threads, %d "
         "processors, lang = %s, task = %s, max_len=%i, split_on_word=%d, "
         "suppress_nst=%d ...\n",
         int(n_samples), float(n_samples) / WHISPER_SAMPLE_RATE,
         wparams.n_threads, 1, wparams.language,
         wparams.translate ? "translate" : "transcribe", wparams.max_len,
         wparams.split_on_word, wparams.suppress_nst);

  printf("\n");
}

#ifdef SHOUT_USE_WEBGPU
// WebGPU JS objects live on the thread that created the device and cannot be
// accessed from a pthread. Run whisper_full directly here (no new thread).
// ASYNCIFY suspends the call stack during GPU waits so the browser stays
// responsive. bind_cancel() can still be called during those suspensions.
void run_transcribe_inline(struct whisper_full_params wparams, std::vector<float> pcmf32) {
  // Force single-threaded CPU ops: spawning pthreads from inside an Asyncify
  // context can cause missed Atomics.notify signals on the main WASM thread.
  // The GPU backend handles the heavy compute, so a single CPU thread is fine.
  wparams.n_threads = 1;

  is_running = true;

  printf("running whisper_full ...\n");
  whisper_full(g_context.get(), wparams, pcmf32.data(), pcmf32.size());
  printf("running whisper_full done\n");

  const int n_segments = whisper_full_n_segments(g_context.get());
  std::string result =
      to_output_json(g_context.get(), 0, n_segments, false, wparams.vad);

  printf("n_segments = %d\n", n_segments);

  for (int i = 0; i < n_segments; ++i) {
    printf("  segment %d: [%lld -> %lld] '%s'\n", i,
           (long long) whisper_full_get_segment_t0(g_context.get(), i),
           (long long) whisper_full_get_segment_t1(g_context.get(), i),
           whisper_full_get_segment_text(g_context.get(), i));
  }

  if (!abort_flag) {
    printf("call onTranscribed (%zu bytes)\n", result.size());
    call_handler("onTranscribed", result);
  } else {
    printf("call onCanceled\n");
    call_handler("onCanceled");
  }

  is_running = false;
}
#else
// language is threaded through separately (rather than relying on
// wparams.language, which was only ever a pointer into the caller's
// short-lived string) so the worker thread's own copy stays alive for as
// long as wparams does.
void run_transcribe_threaded(struct whisper_full_params wparams, std::string language,
                             std::string vad_model_path, std::vector<float> pcmf32) {
  g_worker.start([wparams = std::move(wparams), language = std::move(language),
                  vad_model_path = std::move(vad_model_path),
                  pcmf32 = std::move(pcmf32)]() mutable {
    wparams.language = language.c_str();
    if (wparams.vad) {
      wparams.vad_model_path = vad_model_path.c_str();
    }

    is_running = true;

    printf("running whisper_full ...\n");
    whisper_full(g_context.get(), wparams, pcmf32.data(), pcmf32.size());
    printf("running whisper_full done\n");

    // get segements
    const int n_segments = whisper_full_n_segments(g_context.get());
    std::string result =
        to_output_json(g_context.get(), 0, n_segments, false, wparams.vad);

    if (!abort_flag) {
      call_handler("onTranscribed", result);
    } else {
      printf("call onCanceled in thread \n");
      call_handler("onCanceled");
    }

    is_running = false;
  });
}
#endif

int bind_transcribe(const emscripten::val &audio, const std::string &lang,
                    int nthreads, bool translate, int max_len,
                    bool split_on_word, bool suppress_nst,
                    bool token_timestamps,
                    bool vad, const std::string &vad_model_path,
                    float vad_threshold, int vad_min_speech_duration_ms,
                    int vad_min_silence_duration_ms,
                    float vad_max_speech_duration_s, int vad_speech_pad_ms,
                    float vad_samples_overlap) {

  g_worker.join();

  if (!g_context) {
    return -1;
  }

  // reset abort flag
  abort_flag = false;
  is_running = false;

  // whisper parameter
  struct whisper_full_params wparams = whisper_full_default_params(
      whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);

  // set language to auto if not supported
  std::string language =
      resolve_transcribe_language(g_context.get(), lang, translate, wparams);
  wparams.language = language.c_str();

  wparams.print_realtime = false;
  wparams.print_progress = false;
  wparams.print_timestamps = false;
  wparams.print_special = false;

  wparams.n_threads = std::min(
      nthreads, std::min(16, mpow2(std::thread::hardware_concurrency())));
  wparams.offset_ms = 0;

  wparams.token_timestamps = token_timestamps;
  wparams.max_len = max_len;
  wparams.split_on_word = split_on_word;
  wparams.suppress_nst = suppress_nst;

  wparams.vad = vad;
  wparams.vad_params.threshold = vad_threshold;
  wparams.vad_params.min_speech_duration_ms = vad_min_speech_duration_ms;
  wparams.vad_params.min_silence_duration_ms = vad_min_silence_duration_ms;
  wparams.vad_params.max_speech_duration_s = vad_max_speech_duration_s;
  wparams.vad_params.speech_pad_ms = vad_speech_pad_ms;
  wparams.vad_params.samples_overlap = vad_samples_overlap;

  // audio data
  std::vector<float> pcmf32;
  copy_audio_to_pcm(audio, pcmf32);

  // callbacks
  wparams.progress_callback = progress_callback;
  wparams.new_segment_callback = new_segment_callback;

  wparams.encoder_begin_callback = encoder_begin_callback;
  wparams.encoder_begin_callback_user_data = &abort_flag;

  wparams.abort_callback = abort_callback;
  wparams.abort_callback_user_data = &abort_flag;

  log_transcribe_start(wparams, pcmf32.size());

  // run the worker
#ifdef SHOUT_USE_WEBGPU
  // Synchronous/inline execution: the vad_model_path reference stays valid
  // for the duration of this call, so it's safe to point wparams at it directly.
  if (vad) {
    wparams.vad_model_path = vad_model_path.c_str();
  }
  run_transcribe_inline(std::move(wparams), std::move(pcmf32));
#else
  run_transcribe_threaded(std::move(wparams), std::move(language),
                          std::string(vad_model_path), std::move(pcmf32));
#endif

  return 0;
}

void stream_main(const std::string &lang, int nthreads, bool translate,
                 int max_tokens, int audio_ctx, bool suppress_nst) {
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
  wparams.suppress_nst = suppress_nst;

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

      int ret = whisper_full(g_stream_context.get(), wparams, pcmf32.data(),
                             pcmf32.size());
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
        const int n_segments = whisper_full_n_segments(g_stream_context.get());
        if (n_segments > 0) {
          result_json = to_output_json(g_stream_context.get(), 0, n_segments, true);
        }
      }

      {
        std::lock_guard<std::mutex> lock(g_mutex);
        call_handler("onStreamTranscription", result_json);
      }
    }
  }

  g_stream_context.reset();

  call_handler("onStreamStatus", "stopped");
}

#ifdef SHOUT_USE_WEBGPU
// WebGPU device/queue objects live on the thread that created them (see the
// comment in bind_transcribe), so the stream loop cannot run on a pthread
// like it does in the CPU build. Instead it runs as a self-rescheduling
// main-thread tick: each tick returns to the JS event loop between chunks so
// setStreamAudio()/stopStream() calls (and the browser) stay responsive, and
// Asyncify suspends/resumes the call stack around the GPU waits inside
// whisper_full(), same as the inline path in bind_transcribe.
struct whisper_full_params g_stream_wparams;
std::string g_stream_lang;

void stream_webgpu_tick(void *arg) {
  (void)arg;

  if (!g_stream_running) {
    g_stream_context.reset();
    call_handler("onStreamStatus", "stopped");
    return;
  }

  std::vector<float> pcmf32;

  {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (g_pcmf32.size() < 1024) {
      pcmf32.clear();
    } else {
      pcmf32 = g_pcmf32;
      g_pcmf32.clear();
    }
  }

  if (pcmf32.empty()) {
    stream_set_status("waiting");
    emscripten_async_call(stream_webgpu_tick, nullptr, 10);
    return;
  }

  stream_set_status("processing");

  int ret = whisper_full(g_stream_context.get(), g_stream_wparams, pcmf32.data(),
                         pcmf32.size());
  if (ret != 0) {
    printf("whisper_full() failed: %d\n", ret);
  } else {
    const int n_segments = whisper_full_n_segments(g_stream_context.get());
    if (n_segments > 0) {
      const std::string result_json =
          to_output_json(g_stream_context.get(), 0, n_segments, true);
      call_handler("onStreamTranscription", result_json);
    }
  }

  emscripten_async_call(stream_webgpu_tick, nullptr, 0);
}

void stream_webgpu_start(const std::string &lang, int nthreads,
                         bool translate, int max_tokens, int audio_ctx,
                         bool suppress_nst) {
  stream_set_status("loading");

  g_stream_lang = lang;

  g_stream_wparams = whisper_full_default_params(
      whisper_sampling_strategy::WHISPER_SAMPLING_GREEDY);

  // GPU compute happens on the main thread's Asyncify call stack; spawning
  // extra CPU threads here offers no benefit and risks missed Atomics
  // signals, same reasoning as the single-shot transcribe path.
  g_stream_wparams.n_threads = 1;
  g_stream_wparams.offset_ms = 0;
  g_stream_wparams.translate = translate;
  g_stream_wparams.no_context = true;
  g_stream_wparams.single_segment = true;
  g_stream_wparams.print_realtime = false;
  g_stream_wparams.print_progress = false;
  g_stream_wparams.print_timestamps = false;
  g_stream_wparams.print_special = false;
  g_stream_wparams.no_timestamps = true;

  g_stream_wparams.max_tokens = max_tokens;
  g_stream_wparams.audio_ctx = audio_ctx;

  g_stream_wparams.temperature_inc = 0.0f;
  g_stream_wparams.prompt_tokens = nullptr;
  g_stream_wparams.prompt_n_tokens = 0;

  g_stream_wparams.language = g_stream_lang.c_str();
  g_stream_wparams.suppress_nst = suppress_nst;

  printf("stream: using %d threads\n", g_stream_wparams.n_threads);

  emscripten_async_call(stream_webgpu_tick, nullptr, 0);
}
#endif

// Stream
void bind_start_stream(const std::string &model, const std::string &lang,
                       int nthreads = 16, bool translate = false,
                       int max_tokens = 32, int audio_ctx = 512,
                       bool suppress_nst = false) {
  if (g_stream_context) {
    return;
  }

  struct whisper_context_params cparams = whisper_context_default_params();
#ifdef SHOUT_USE_WEBGPU
  cparams.use_gpu = true;
#else
  cparams.use_gpu = false;
#endif
  g_stream_context.reset(whisper_init_from_file_with_params(model.c_str(), cparams));

  if (g_stream_context) {
    g_stream_running = true;

#ifdef SHOUT_USE_WEBGPU
    stream_webgpu_start(lang, nthreads, translate, max_tokens, audio_ctx,
                        suppress_nst);
#else
    g_stream_worker.start(
        [lang, nthreads, translate, max_tokens, audio_ctx, suppress_nst]() {
          stream_main(lang, nthreads, translate, max_tokens, audio_ctx,
                      suppress_nst);
        });
#endif
  }

  whisper_free_context_params(&cparams);
}

void bind_stop_stream() {
  if (g_stream_running) {
    g_stream_running = false;
  }

  printf("stream stopped\n");
}

void bind_set_stream_audio(const emscripten::val &audio) {
  std::lock_guard<std::mutex> lock(g_mutex);
  copy_audio_to_pcm(audio, g_pcmf32);
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
