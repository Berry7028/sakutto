# Page bench — webgpu-2seq-e72a60d

- Mode: live
- Commit: `e72a60d0d81dbc2ecb258087952fa0a917878ec4`
- Started: 2026-11-07T19:21:40.855Z
- Fixtures: 1, samples per fixture: 3

| Page         | First visible text (ms) | Viewport done (ms) | Full page (ms) | Blocks/s | Output chars | Engine |
| ------------ | ----------------------: | -----------------: | -------------: | -------: | -----------: | ------ |
| long-article |                    1127 |               7601 |          21551 |      2.1 |         2910 | webgpu |

## Headline numbers (long-article)

Engine: **WebGPU** (8 threads) · mode `live` · commit `e72a60d`

| Metric                                     |  Value |
| ------------------------------------------ | -----: |
| Time to first visible translated paragraph |  1.1 s |
| Full page translated                       | 21.6 s |
| Remaining work after the first paragraph   | 20.4 s |

These are the two numbers to cite from a `live` run. Mock numbers measure the
scheduler, not the model, and must not be presented as translation speed.
