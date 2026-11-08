# Changelog

Release sections are added by `pnpm release`. Each section lists commit subjects since the previous `vX.Y.Z` tag.

## [1.0.1] - 2026-11-08

- Larger glossaries, longer typed-text translation, stronger privacy guards, a
  clearer Chrome Web Store listing, and faster GPU page translation.
- Glossary lists can now hold far more of your own terms. A user requested a much
  larger, effectively unlimited glossary, and that seemed reasonable. Each stored
  or imported list (the global glossary, and each site list) now keeps up to 5,000
  entries instead of 1,000. A translate message may carry the merged global and
  site lists together, up to 10,000 entries. The model prompt still includes only
  the terms that actually appear in the current segment, so a large list is not
  pasted in full.
- Typed-text translation accepts a much longer paste in one go. The per-request
  ceiling is 100,000 characters, up from 20,000, because on-device translation has
  no per-character cost. Long text is still split into prompt-sized pieces for the
  model. Surrounding context taken from a page stays at 20,000 characters.
- Text you type into a page is kept out of the model. Selecting everything in a
  search box, message box, or form no longer queues that field as if it were page
  copy. The same guard follows the caret into custom elements that wrap their own
  inputs. Closed shadow roots stay out of reach. A run of dots or asterisks in
  ordinary page text is no longer treated as a hidden password; only a real
  password field is masked that way.
- The on-page translation overlay is closed off from the host page, so a site
  script cannot read its label, rewrite it, or turn on "always translate this
  site" for you.
- The extension's own network use is still just the model download. That request
  carries no page text and no credentials, and extension pages do not load remote
  scripts, styles, or fonts. Those surfaces are checked in tests, not only claimed
  in review notes. The privacy policy was also aligned with the download itself:
  the file is written, hashed against the pin, and kept only when the digest
  matches.
- The privacy policy is rewritten as a stable page for readers. In English and
  Japanese it explains the kinds of data involved and who can see them, instead of
  tracking every implementation detail (hash order, byte sizes, button labels). It
  says translation runs on your device, there is no account, advertising, or
  analytics, and the only file the extension downloads is the model.
- Keyboard hints now show the Mac keys next to the Windows ones: Option+A,
  Option+B, and Option+S beside Alt+A/B/S, and ⌘+Enter beside Ctrl+Enter on the
  typed-text page.
- The Chrome Web Store listing matches the packaged locales. The item name is
  "Sakutto - Local AI translation" (Japanese: "Sakutto - ローカルAI翻訳"). The
  short summary no longer repeats "Built with PLaMo"; that credit stays in the
  detailed description. The detailed copy covers page, selection, and typed
  translation, says there are no ads or analytics, and states that page text is
  not sent to a translation server.
- On a GPU, page translation now decodes two paragraphs at once, each with its own
  KV cache. A shared cache had made the paragraph after a pair much slower, which
  added up on long pages. The translated text is unchanged. CPU translation is
  untouched.

## [1.0.0] - 2026-11-06

- No commits since the previous release.

## [0.1.1] - 2026-11-06

- Initial public source release
- Rename the public product to Sakutto.
- Format the store zip example after the package rename.
- Redraw the Sakutto mark as a folded strip.
- Ignore local video renders.
- Restore onboarding after the pinned GGUF commits moved.
- Add Chrome Web Store listing copy and review notes (#3)
- Show a selection icon that translates the highlight immediately (#5)
- Add a manual Chrome Web Store upload workflow. (#4)
- Keep long pages moving while PLaMo translates
- Keep translated text readable and translate whole pages
- Translate pages with PLaMo only, with no 簡易訳 badge or Chrome draft (#8)
- Add a durable page-translation speed bench with headline numbers (#9)
- Fix ranking-table layout collapse and pack short blocks into one request (#10)
- Make whole-page PLaMo translation continuous: one prompt per paragraph, headline first, held tok/s, WebGPU fallback detection (#11)
- Describe PLaMo license terms in onboarding and record consent honestly (#12)
- Serve bundled licences as UTF-8, cover special page prose, add typed translation, clarify licence onboarding (#13)
- Hide start controls until PLaMo can answer, and compare typed text side by side (#14)
- Drop the typed page's outer card and separate the panes with rules
- Keep the local launch-video renders out of git and the linter
