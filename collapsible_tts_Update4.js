function initializeSafetyModule(moduleId) {
  console.log(`Initializing safety module: ${moduleId}`);

  function init() {
    const module = document.getElementById(moduleId);
    if (!module) {
      console.warn(`Module with ID ${moduleId} not found`);
      return;
    }

    const collapsibleBtn = module.querySelector(`.${moduleId}-btn`);
    const collapsibleContent = module.querySelector(`.${moduleId}-content`);
    const playButton = module.querySelector(`.${moduleId}-play`);
    const pauseButton = module.querySelector(`.${moduleId}-pause`);
    const stopButton = module.querySelector(`.${moduleId}-stop`);
    const voiceSelect = module.querySelector(`.${moduleId}-voice`);
    const contentDiv = module.querySelector(`.${moduleId}-tts-content`);

    if (!contentDiv || !voiceSelect || !playButton || !pauseButton || !stopButton || !collapsibleBtn || !collapsibleContent) {
      console.error(`Missing elements for ${moduleId}:`, {
        contentDiv: contentDiv ? "Found" : "Missing",
        voiceSelect: voiceSelect ? "Found" : "Missing",
        playButton: playButton ? "Found" : "Missing",
        pauseButton: pauseButton ? "Found" : "Missing",
        stopButton: stopButton ? "Found" : "Missing",
        collapsibleBtn: collapsibleBtn ? "Found" : "Missing",
        collapsibleContent: collapsibleContent ? "Found" : "Missing"
      });
      return;
    }

    let voices = [], spans = [], lines = [], utteranceQueue = [], currentUtterance = null, highlightInterval = null;
    let originalContent = contentDiv.innerHTML;
    let voicesLoaded = false;
    let pauseLineIndex = 0;
    let lastSpokenLineIndex = -1;
    let isPlaying = false;
    let isGoogleVoice = false;
    let isPaused = false;

    // Initialize Media Session API
    if ("mediaSession" in navigator) {
      console.log("Media Session API supported");
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Safety Module",
        artist: "Training Course",
        album: "Moodle Module",
        artwork: [
          { src: "https://dummyimage.com/96x96", sizes: "96x96", type: "image/png" },
          { src: "https://dummyimage.com/128x128", sizes: "128x128", type: "image/png" }
        ]
      });

      navigator.mediaSession.setActionHandler("play", () => {
        console.log("Media Session: Play action triggered");
        if (isPaused && currentUtterance) {
          isPaused = false;
          window.speechSynthesis.resume();
          if (!highlightInterval && isGoogleVoice) {
            startLineHighlighting(130, pauseLineIndex);
          }
          isPlaying = true;
          navigator.mediaSession.playbackState = "playing";
          console.log(`Media Session: Resumed at line ${pauseLineIndex}`);
        } else if (!isPlaying) {
          playButton.click(); // Trigger playButton logic
        }
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        console.log("Media Session: Pause action triggered");
        if (isPlaying && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          if (highlightInterval) clearTimeout(highlightInterval);
          if (isGoogleVoice && utteranceQueue.length > 0 && utteranceQueue[0].lineIndex !== undefined) {
            pauseLineIndex = utteranceQueue[0].lineIndex;
            isPaused = true;
            console.log(`Media Session: Paused at line ${pauseLineIndex}`);
          }
          isPlaying = false;
          navigator.mediaSession.playbackState = "paused";
        }
      });
    } else {
      console.warn("Media Session API not supported");
    }

    collapsibleBtn.addEventListener("click", function () {
      const isOpen = collapsibleContent.style.maxHeight && collapsibleContent.style.maxHeight !== "0px";
      this.classList.toggle("active");
      collapsibleContent.style.maxHeight = isOpen ? "0px" : collapsibleContent.scrollHeight + "px";
      if (!isOpen && !voicesLoaded) {
        populateVoices();
      }
      console.log(`Collapsible button clicked, isOpen: ${isOpen}`);
    });

    function populateVoices(attempts = 0) {
      voices = window.speechSynthesis.getVoices();
      console.log(`Attempt ${attempts}: Found ${voices.length} voices`);
      console.log("Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(", "));
      voiceSelect.innerHTML = "";
      if (voices.length === 0) {
        if (attempts < 5) {
          voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
          setTimeout(() => populateVoices(attempts + 1), 100);
        } else {
          voiceSelect.innerHTML = '<option value="">No voices available</option>';
          console.warn("No voices loaded after 5 attempts");
        }
        return;
      }

      voices.forEach((voice, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.text = `${voice.name} (${voice.lang})`;
        voiceSelect.appendChild(option);
      });

      const pageLang = getPageLang();
      let defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-MX" && voice.name.includes("Microsoft"));
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-ES" && voice.name.includes("Microsoft"));
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang.startsWith("es") && voice.name.includes("Microsoft"));
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-MX" && voice.name.includes("Google"));
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-ES" && voice.name.includes("Google"));
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang.startsWith("es") && voice.name.includes("Google"));
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-MX");
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang === "es-ES");
      }
      if (defaultVoiceIndex === -1) {
        defaultVoiceIndex = voices.findIndex(voice => voice.lang.startsWith("es"));
      }
      defaultVoiceIndex = defaultVoiceIndex >= 0 ? defaultVoiceIndex : 0;
      voiceSelect.value = defaultVoiceIndex;
      console.log(`Default voice set to: ${voices[defaultVoiceIndex]?.name || 'unknown'} (${voices[defaultVoiceIndex]?.lang || 'unknown'})`);
      voicesLoaded = true;
    }

    function getPageLang() {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get("lang");
      const htmlLang = contentDiv.querySelector("[lang]")?.getAttribute("lang");
      return urlLang ? urlLang : (htmlLang || "en");
    }

    function wrapWordsInSpans() {
      spans = [];
      contentDiv.innerHTML = originalContent;
      const elements = contentDiv.querySelectorAll("p, li, h1, h2, h3");
      elements.forEach(el => {
        if (!el.querySelector("img")) {
          const text = el.textContent;
          const tokens = text.split(/(\s+)/);
          let spanIndex = spans.length;
          let htmlParts = tokens.map((token, i) => {
            if (token.trim()) {
              return `<span data-index="${spanIndex++}">${token}</span>`;
            } else {
              return token;
            }
          });
          el.innerHTML = htmlParts.join("");
          spans.push(...el.querySelectorAll("span[data-index]"));
        }
      });
      console.log(`Microsoft spans created: ${spans.length}`);
    }

    function wrapLines() {
      lines = [];
      contentDiv.innerHTML = originalContent;
      const elements = contentDiv.querySelectorAll("p, li, h1, h2, h3");
      let charOffset = 0;
      const processedTexts = new Set();

      elements.forEach((el, index) => {
        if (!el.querySelector("img") && el.textContent.trim()) {
          const text = el.textContent.trim();
          if (text.match(/^(Figura|Fig)\s*\d+/)) {
            console.log(`Skipping figure caption: ${text}`);
            return;
          }
          const normalizedText = text.replace(/\s+/g, " ").trim();
          if (processedTexts.has(normalizedText)) {
            console.log(`Skipping duplicate text: ${normalizedText}`);
            return;
          }
          processedTexts.add(normalizedText);
          const words = normalizedText.split(/\s+/).filter(w => w.trim());
          const wordCount = words.length;

          if (wordCount > 20) {
            const maxWordsPerChunk = 20;
            let currentWords = [];
            let currentWordCount = 0;
            let chunkSpans = [];

            for (let i = 0; i < words.length; i++) {
              currentWords.push(words[i]);
              currentWordCount++;
              if (currentWordCount >= maxWordsPerChunk || i === words.length - 1 || normalizedText[currentWords.join(" ").length] === ".") {
                const chunkText = currentWords.join(" ");
                const chunkWordCount = currentWordCount;
                const span = document.createElement("span");
                span.className = "chunk";
                span.innerHTML = chunkText.replace(/ /g, " ");
                chunkSpans.push(span);
                lines.push({
                  element: span,
                  text: chunkText,
                  wordCount: chunkWordCount,
                  charStart: charOffset,
                  charEnd: charOffset + chunkText.length,
                  isChunk: true,
                  parentElement: el
                });
                console.log(`Line ${lines.length - 1}: "${chunkText}", words: ${chunkWordCount}, DOM: "${span.innerHTML}"`);
                charOffset += chunkText.length + 1;
                currentWords = [];
                currentWordCount = 0;
              }
            }
            el.innerHTML = "";
            chunkSpans.forEach((span, i) => {
              el.appendChild(span);
              if (i < chunkSpans.length - 1) {
                el.appendChild(document.createTextNode(" "));
              }
            });
          } else {
            lines.push({
              element: el,
              text: normalizedText,
              wordCount: wordCount,
              charStart: charOffset,
              charEnd: charOffset + normalizedText.length,
              isChunk: false
            });
            console.log(`Line ${lines.length - 1}: "${normalizedText}", words: ${wordCount}`);
            charOffset += normalizedText.length + 1;
          }
        }
      });
      console.log(`Google lines created: ${lines.length}`);
    }

    function startLineHighlighting(speechRate = 130, startLineIndex = 0) {
      const msPerWord = (60 * 1000) / speechRate;
      const minDuration = 1000;
      let lineIndex = startLineIndex;

      function highlightNextLine() {
        if (lineIndex < lines.length) {
          const currentLine = lines[lineIndex];
          const lineDuration = Math.max(currentLine.wordCount * msPerWord, minDuration);
          if (lineIndex > 0) {
            const prevLine = lines[lineIndex - 1];
            prevLine.element.style.backgroundColor = "";
          }
          currentLine.element.style.backgroundColor = "yellow";
          console.log(`Line ${lineIndex}: "${currentLine.text}", words: ${currentLine.wordCount}, duration: ${lineDuration} ms`);
          lineIndex++;
          highlightInterval = setTimeout(highlightNextLine, lineDuration);
        } else {
          lines.forEach(line => line.element.style.backgroundColor = "");
          highlightInterval = null;
          console.log("Highlighting complete");
        }
      }

      if (lines.length > 0 && startLineIndex < lines.length) {
        lines.forEach(line => line.element.style.backgroundColor = "");
        highlightNextLine();
      } else {
        console.warn("No lines to highlight or invalid startLineIndex");
      }
    }

    function prepareUtterance(startLineIndex = 0) {
      utteranceQueue = [];
      wrapLines();
      const selectedVoiceIndex = parseInt(voiceSelect.value);
      const selectedVoice = voices[selectedVoiceIndex];
      isGoogleVoice = selectedVoice && selectedVoice.name.includes("Google");
      const pageLang = getPageLang();

      if (!isGoogleVoice) {
        wrapWordsInSpans();
        const singleUtterance = new SpeechSynthesisUtterance(lines.map(line => line.text).join(" "));
        if (selectedVoice) {
          singleUtterance.voice = selectedVoice;
          singleUtterance.lang = selectedVoice.lang;
        } else {
          singleUtterance.lang = pageLang === "es" ? "es-MX" : "en-US";
        }
        singleUtterance.onboundary = (event) => {
          if (event.name === "word") {
            const charIndex = event.charIndex;
            const wordIndex = singleUtterance.text.substring(0, charIndex).split(/\s+/).length - 1;
            spans.forEach(span => span.style.backgroundColor = "");
            if (spans[wordIndex]) {
              spans[wordIndex].style.backgroundColor = "yellow";
              console.log(`Highlighting word ${wordIndex}: ${spans[wordIndex].textContent}`);
            }
          }
        };
        singleUtterance.onstart = () => {
          console.log("Microsoft voice utterance started");
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        };
        singleUtterance.onend = () => {
          spans.forEach(span => span.style.backgroundColor = "");
          currentUtterance = null;
          utteranceQueue = [];
          pauseLineIndex = 0;
          isPlaying = false;
          isPaused = false;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
          console.log("Microsoft voice utterance ended");
        };
        singleUtterance.onerror = (event) => {
          console.error("Microsoft voice utterance error:", event.error);
          spans.forEach(span => span.style.backgroundColor = "");
          currentUtterance = null;
          utteranceQueue = [];
          pauseLineIndex = 0;
          isPlaying = false;
          isPaused = false;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
        };
        singleUtterance.onpause = () => {
          console.log("Microsoft voice paused");
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
        };
        singleUtterance.onresume = () => {
          console.log("Microsoft voice resumed");
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        };
        utteranceQueue = [singleUtterance];
        console.log(`Microsoft utterance queued: "${singleUtterance.text.substring(0, 50)}..."`);
        return singleUtterance;
      }

      const effectiveStartIndex = Math.max(startLineIndex, lastSpokenLineIndex + 1);
      for (let i = effectiveStartIndex; i < lines.length; i++) {
        const line = lines[i];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lineIndex = i;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
        } else {
          utterance.lang = pageLang === "es" ? "es-MX" : "es-ES";
        }
        utterance.onstart = () => {
          console.log(`Google voice utterance started for line ${i}: "${line.text}"`);
          startLineHighlighting(130, i);
          lastSpokenLineIndex = i;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        };
        utterance.onend = () => {
          console.log(`Google voice utterance ended for line ${i}`);
          if (highlightInterval) clearTimeout(highlightInterval);
          if (!isPaused) {
            utteranceQueue.shift();
            isPlaying = utteranceQueue.length > 0;
            if (utteranceQueue.length > 0) {
              currentUtterance = utteranceQueue[0];
              setTimeout(() => {
                if (isPlaying && !window.speechSynthesis.paused) {
                  window.speechSynthesis.speak(currentUtterance);
                  console.log(`Advancing to next utterance: line ${currentUtterance.lineIndex}`);
                }
              }, 10);
            } else {
              lines.forEach(line => line.element.style.backgroundColor = "");
              currentUtterance = null;
              utteranceQueue = [];
              pauseLineIndex = 0;
              isPlaying = false;
              isPaused = false;
              if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
              }
              console.log("Google TTS completed");
            }
          }
        };
        utterance.onerror = (event) => {
          console.error(`Google voice utterance error for line ${i}:`, event.error);
          if (highlightInterval) clearTimeout(highlightInterval);
          if (!isPaused && event.error !== "interrupted") {
            utteranceQueue.shift();
            isPlaying = utteranceQueue.length > 0;
            if (utteranceQueue.length > 0) {
              currentUtterance = utteranceQueue[0];
              setTimeout(() => {
                if (isPlaying && !window.speechSynthesis.paused) {
                  window.speechSynthesis.speak(currentUtterance);
                  console.log(`Recovered from error, advancing to line ${currentUtterance.lineIndex}`);
                }
              }, 10);
            } else {
              lines.forEach(line => line.element.style.backgroundColor = "");
              currentUtterance = null;
              utteranceQueue = [];
              pauseLineIndex = 0;
              isPlaying = false;
              isPaused = false;
              if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
              }
              console.log("Google TTS stopped due to error");
            }
          } else if (event.error === "interrupted" && isPlaying) {
            console.log(`Interrupted error for line ${i}, advancing queue`);
            utteranceQueue.shift();
            isPlaying = utteranceQueue.length > 0;
            if (utteranceQueue.length > 0) {
              currentUtterance = utteranceQueue[0];
              setTimeout(() => {
                if (isPlaying && !window.speechSynthesis.paused) {
                  window.speechSynthesis.speak(currentUtterance);
                  console.log(`Advancing after interrupted error to line ${currentUtterance.lineIndex}`);
                }
              }, 10);
            }
          }
        };
        utterance.onpause = () => {
          if (highlightInterval) clearTimeout(highlightInterval);
          pauseLineIndex = i;
          isPaused = true;
          console.log(`Google voice paused at line ${pauseLineIndex}`);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
        };
        utterance.onresume = () => {
          if (!highlightInterval) startLineHighlighting(130, pauseLineIndex);
          console.log(`Google voice resumed at line ${pauseLineIndex}`);
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
        };
        utteranceQueue.push(utterance);
        console.log(`Google utterance queued for line ${i}: "${line.text.substring(0, 50)}..."`);
      }

      return utteranceQueue.length > 0 ? utteranceQueue[0] : null;
    }

    voiceSelect.addEventListener("change", () => {
      window.speechSynthesis.cancel();
      if (highlightInterval) clearTimeout(highlightInterval);
      currentUtterance = null;
      utteranceQueue = [];
      pauseLineIndex = 0;
      lastSpokenLineIndex = -1;
      isPlaying = false;
      isPaused = false;
      lines.forEach(line => line.element.style.backgroundColor = "");
      spans.forEach(span => span.style.backgroundColor = "");
      contentDiv.innerHTML = originalContent;
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      console.log("Voice changed, TTS reset");
    });

    playButton.addEventListener("click", function () {
      if ('speechSynthesis' in window) {
        if (!voicesLoaded) populateVoices();
        console.log(`Play button clicked, paused: ${window.speechSynthesis.paused}, speaking: ${window.speechSynthesis.speaking}, pending: ${window.speechSynthesis.pending}, currentUtterance: ${!!currentUtterance}, pauseLineIndex: ${pauseLineIndex}, utteranceQueue: ${utteranceQueue.map(u => u.lineIndex).join(", ")}`);
        if (window.speechSynthesis.paused && currentUtterance && utteranceQueue.length > 0) {
          isPaused = false;
          window.speechSynthesis.resume();
          if (!highlightInterval && isGoogleVoice) {
            startLineHighlighting(130, pauseLineIndex);
          }
          isPlaying = true;
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          console.log(`Resuming ${isGoogleVoice ? "Google" : "Microsoft"} voice at line ${pauseLineIndex}`);
        } else if (!isPlaying && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
          setTimeout(() => {
            currentUtterance = prepareUtterance(pauseLineIndex);
            if (currentUtterance) {
              utteranceQueue = utteranceQueue.slice(utteranceQueue.indexOf(currentUtterance));
              window.speechSynthesis.speak(currentUtterance);
              isPlaying = true;
              if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "playing";
              }
              console.log(`Starting ${isGoogleVoice ? "Google" : "Microsoft"} voice from line ${pauseLineIndex}`);
            }
          }, 10);
        }
      } else {
        alert("Text-to-speech is not supported in this browser.");
      }
    });

    pauseButton.addEventListener("click", () => {
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        if (highlightInterval) clearTimeout(highlightInterval);
        if (isGoogleVoice && utteranceQueue.length > 0 && utteranceQueue[0].lineIndex !== undefined) {
          pauseLineIndex = utteranceQueue[0].lineIndex;
          isPaused = true;
          console.log(`Paused Google voice at line ${pauseLineIndex}, utteranceQueue: ${utteranceQueue.map(u => u.lineIndex).join(", ")}`);
        } else if (!isGoogleVoice) {
          console.log("Paused Microsoft voice");
        }
        isPlaying = false;
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      }
    });

    stopButton.addEventListener("click", () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        if (highlightInterval) clearTimeout(highlightInterval);
        spans.forEach(span => span.style.backgroundColor = "");
        lines.forEach(line => line.element.style.backgroundColor = "");
        currentUtterance = null;
        utteranceQueue = [];
        pauseLineIndex = 0;
        lastSpokenLineIndex = -1;
        isPlaying = false;
        isPaused = false;
        contentDiv.innerHTML = originalContent;
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
        console.log("Stop button clicked, TTS reset");
      }
    });

    window.addEventListener("beforeunload", function cleanup() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        if (highlightInterval) clearTimeout(highlightInterval);
      }
      window.removeEventListener("beforeunload", cleanup);
    });

    populateVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      if (!voicesLoaded) {
        console.log("Voices loaded via onvoiceschanged");
        populateVoices();
      }
    };
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    // DOM already ready — run asynchronously to mimic DOMContentLoaded timing
    setTimeout(init, 0);
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
}
