# Local Ollama

Sakutto can send its PLaMo prompt to a local [Ollama](https://ollama.com/) server instead of running the 0.8B model inside the browser. This is optional. The in-browser engine stays the default and needs no setup.

## Why use it

- **A larger checkpoint.** The browser build ships PLaMo 3 Translate 0.8B. Ollama can run 2B, 8B, or 31B, which is the main quality step available.
- **The machine's own GPU.** Ollama uses its llama.cpp build directly, without the WebGPU limits of the extension sandbox.
- **Less browser memory.** When Ollama is selected, Sakutto releases the in-browser model, so the browser does not hold both.
- **The same prompt.** Sakutto sends the same PFML3 prompt, glossary, and formality settings as the browser engine. Only the completion call changes.

The trade-offs:

- Page text, selections, and typed text leave the extension and go to the Ollama URL you configure. Keep that URL on your own machine, or on a network you trust.
- Ollama has to be running. If it is not, the page keeps its source text; Sakutto does not silently switch back to the smaller in-browser model.
- The first request after a restart loads the model into memory and can take several seconds.

## Requirements

- Ollama, any recent version.
- Enough memory for the checkpoint you choose. Leave headroom for Chrome and the rest of the system.

| Model | Q4_K_M file | Rough memory | Notes                                       |
| ----- | ----------- | ------------ | ------------------------------------------- |
| 0.8B  | 573 MB      | ~1.5 GB      | Same size as the in-browser model           |
| 2B    | 1.81 GB     | ~3 GB        | A visible quality step; fits most laptops   |
| 8B    | 5.28 GB     | ~7 GB        | Better still, if the machine has the memory |
| 31B   | 19.6 GB     | ~24 GB       | Workstation GPU territory                   |

The sizes are the `Q4_K_M` files from the PLaMo GGUF repositories. Other quantizations trade memory for accuracy.

## 1. Install Ollama

Install it from [ollama.com](https://ollama.com/download), or with a package manager:

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

On Windows, use the installer from the download page. Check the command:

```bash
ollama --version
```

## 2. Pull a PLaMo model

The PLaMo model card recommends pulling the Hugging Face GGUF directly. No Modelfile is needed:

```bash
# 2B, a good default
ollama pull hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M

# Other sizes
ollama pull hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M
ollama pull hf.co/pfnet/plamo-3-translate-8b-GGUF:Q4_K_M
ollama pull hf.co/pfnet/plamo-3-translate-31b-GGUF:Q4_K_M
```

`ollama list` prints the exact name to paste into Sakutto:

```text
NAME                                              SIZE
hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M      1.8 GB
```

Sakutto sends prompts to `/api/generate` with `"raw": true`. That is the form the model card recommends for Ollama: the prompt already carries the PLaMo PFML3 tags, so Ollama must not apply its own chat template on top.

## 3. Allow the extension origin

Ollama refuses browser origins it does not know with `403 Forbidden`. A Chrome extension sends `Origin: chrome-extension://<id>`, which is not in Ollama's default list. Add the extension origin to `OLLAMA_ORIGINS` and restart Ollama.

The Chrome Web Store build has the ID `mhlbjjijfkoghmcjndgdimhdlfkhadfl`.

### macOS

The menu-bar app reads its environment from `launchd`:

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl"
```

Quit Ollama completely, then open it again. If you start the server from a terminal instead:

```bash
OLLAMA_ORIGINS="chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl" ollama serve
```

### Linux

The daemon runs under systemd, so a shell `export` does nothing. Edit the unit:

```bash
sudo systemctl edit ollama
```

Add:

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl"
```

Then reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Windows

1. Open **Settings → System → About → Advanced system settings → Environment Variables**.
2. Add a user variable named `OLLAMA_ORIGINS` with the value `chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl`.
3. Quit Ollama from the tray and start it again.

### A self-built extension

The ID of an unpacked build is different. Open `chrome://extensions`, turn on **Developer mode**, and copy the ID on the Sakutto card. Use `chrome-extension://<that-id>`.

`chrome-extension://*` also works, but it trusts every extension you have installed. Prefer the exact ID.

### Check the origin

```bash
curl -i \
  -H "Origin: chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl" \
  http://127.0.0.1:11434/api/tags
```

A `200 OK` with an `Access-Control-Allow-Origin` header means the origin is allowed. A `403` means Ollama did not read the new value; quit it completely and start it again.

## 4. Configure Sakutto

1. Open the extension's options page.
2. Under **Local Ollama**, set **Translation engine** to **Local Ollama**.
3. Leave the URL at `http://127.0.0.1:11434` unless Ollama runs somewhere else.
4. Set **Model name** to the name from `ollama list`.
5. Press **Allow access** and accept Chrome's permission prompt.
6. Press **Check connection**. It should say **Connected. The model is installed.**
7. Translate a page, a selection, or typed text as usual.

The permission is for the Ollama origin only. Sakutto does not request access to every site at install time, and it does not send anything to the developer.

## Choosing a model

- **2B Q4_K_M** is the recommended starting point. It is a clear step up from the 0.8B browser model and runs on a laptop.
- **8B Q4_K_M** is noticeably better if the machine has around 8 GB free for the model. On Apple silicon, Ollama uses the GPU through Metal.
- **31B** needs a workstation GPU and roughly 24 GB of memory. It is not a laptop model.
- **Q5_K_M / Q8_0** use more memory for a small accuracy gain. **Q2_K / Q3_K_M** are smaller and lower quality.

You can switch models at any time; the next request uses the new name.

## What the extension sends

- `POST <your URL>/api/generate` with `raw: true`, `stream: true`, `temperature: 0`, `num_ctx: 4096`, a `num_predict` sized to the text, and the PLaMo stop tokens.
- The same PFML3 prompt as the browser engine, including the glossary and page context.
- Nothing else. The developer does not receive page text, selections, the glossary, or translations.

Sakutto sends one completion at a time to Ollama. That keeps the full `num_ctx` for each paragraph and avoids Ollama splitting the context between parallel sequences.

## Troubleshooting

| Symptom                                                                     | Cause                                                  | Fix                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `403 Forbidden`                                                             | `OLLAMA_ORIGINS` does not include the extension origin | Add the exact origin and restart Ollama; check with the `curl` command above                                       |
| `Could not reach the Ollama server`                                         | Ollama is not running, or the URL/port is wrong        | Run `ollama serve`, then `curl http://127.0.0.1:11434/api/tags`                                                    |
| `Connected, but this model is not installed`                                | The model name does not match `ollama list`            | Pull the model, or paste the exact name                                                                            |
| The first translation is slow                                               | Ollama is loading the checkpoint                       | Wait for the first token; later paragraphs reuse the loaded model                                                  |
| Out of memory                                                               | The checkpoint or context is too large                 | Use a smaller quantization or model; close other GPU-heavy apps                                                    |
| Chrome says access was not granted                                          | The permission prompt was dismissed                    | Press **Allow access** again, or change the URL and grant the new origin                                           |
| A page keeps its source text                                                | Ollama failed mid-request                              | Check the options page status; the page does not fall back to the in-browser model                                 |
| The status says "Ollama is not selected" while the picker says Local Ollama | The engine host could not see the saved choice         | The offscreen document has no `chrome.storage`, so the background now sends it the settings. Update the extension. |

`ollama ps` shows which model is loaded and how long it will stay. Sakutto asks Ollama to keep it for 30 minutes after the last request.

## Security

Ollama has no authentication. Keep it on `127.0.0.1` unless you have put an authenticated proxy in front of it. Do not set `OLLAMA_HOST=0.0.0.0` on an untrusted network.

Prefer the exact extension origin over `chrome-extension://*`. The wildcard trusts every extension in the browser, and any of them could then use your local models.

## License

The model is PLaMo 3 Translate under the PLaMo Community License. Ollama and llama.cpp have their own licenses. See [NOTICE](../NOTICE) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Japanese version: [OLLAMA.ja.md](OLLAMA.ja.md).
