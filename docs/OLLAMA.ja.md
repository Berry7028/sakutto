# ローカル Ollama

Sakutto は、ブラウザの中で 0.8B のモデルを動かす代わりに、同じ PLaMo のプロンプトをローカルの [Ollama](https://ollama.com/) へ送れます。この機能は任意です。既定はブラウザ内のエンジンで、設定は要りません。

## 使う理由

- **より大きなモデル。** ブラウザ版は PLaMo 3 Translate 0.8B です。Ollama なら 2B、8B、31B を動かせます。品質を上げる一番わかりやすい選択肢です。
- **マシンの GPU をそのまま使える。** Ollama は自前の llama.cpp で動くため、拡張機能の WebGPU の制約がありません。
- **ブラウザのメモリを空けられる。** Ollama を選ぶと、ブラウザ内のモデルは解放されます。両方を抱え込むことはありません。
- **プロンプトは同じ。** PFML3 のプロンプト、用語集、文体の指定はブラウザ内エンジンと共通です。変わるのは補完の呼び出しだけです。

注意点:

- ページの本文、選択範囲、入力したテキストは、拡張機能の外にある設定済みの Ollama URL へ送られます。自分のマシンか、信頼できるネットワークに置いてください。
- Ollama が動いている必要があります。動いていないときは原文のままになり、小さなブラウザ内モデルへ黙って切り替わることはありません。
- 起動後の最初のリクエストは、モデルをメモリへ読み込むため数秒かかることがあります。

## 必要なもの

- Ollama（最近のバージョン）。
- 選ぶモデルに見合ったメモリ。Chrome と OS の分も残してください。

| モデル | Q4_K_M のファイル | メモリの目安 | 備考                                           |
| ------ | ----------------- | ------------ | ---------------------------------------------- |
| 0.8B   | 573 MB            | 約 1.5 GB    | ブラウザ内モデルと同じ大きさ                   |
| 2B     | 1.81 GB           | 約 3 GB      | 品質の差がわかりやすい。多くのノート PC で動く |
| 8B     | 5.28 GB           | 約 7 GB      | メモリがあればさらに良い                       |
| 31B    | 19.6 GB           | 約 24 GB     | ワークステーション向け                         |

大きさは PLaMo の GGUF リポジトリにある `Q4_K_M` の値です。他の量子化は、メモリと精度のバランスが変わります。

## 1. Ollama を入れる

[ollama.com](https://ollama.com/download) から入れるか、パッケージマネージャーを使います。

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

Windows はダウンロードページのインストーラーを使います。確認:

```bash
ollama --version
```

## 2. PLaMo のモデルを取得する

PLaMo のモデルカードは、Hugging Face の GGUF を直接取得する方法を案内しています。Modelfile は要りません。

```bash
# まずは 2B
ollama pull hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M

# 他のサイズ
ollama pull hf.co/pfnet/plamo-3-translate-0.8b-GGUF:Q4_K_M
ollama pull hf.co/pfnet/plamo-3-translate-8b-GGUF:Q4_K_M
ollama pull hf.co/pfnet/plamo-3-translate-31b-GGUF:Q4_K_M
```

`ollama list` に出る名前を、そのまま Sakutto に貼り付けます。

```text
NAME                                              SIZE
hf.co/pfnet/plamo-3-translate-2b-GGUF:Q4_K_M      1.8 GB
```

Sakutto は `/api/generate` に `"raw": true` を付けて送ります。モデルカードが Ollama 向けに案内している形です。プロンプトには PLaMo の PFML3 タグが入っているため、Ollama 側でチャットテンプレートを重ねてはいけません。

## 3. 拡張機能のオリジンを許可する

Ollama は知らないブラウザのオリジンを `403 Forbidden` で拒否します。Chrome 拡張機能は `Origin: chrome-extension://<ID>` を送るため、既定の許可リストに入っていません。`OLLAMA_ORIGINS` に拡張機能のオリジンを足して、Ollama を再起動します。

Chrome ウェブストア版の ID は `mhlbjjijfkoghmcjndgdimhdlfkhadfl` です。

### macOS

メニューバーのアプリは `launchd` から環境変数を読みます。

```bash
launchctl setenv OLLAMA_ORIGINS "chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl"
```

Ollama を完全に終了してから、もう一度開きます。ターミナルでサーバーを起動する場合は次のとおりです。

```bash
OLLAMA_ORIGINS="chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl" ollama serve
```

### Linux

デーモンは systemd の下で動くため、シェルの `export` は効きません。ユニットを編集します。

```bash
sudo systemctl edit ollama
```

次を追加します。

```ini
[Service]
Environment="OLLAMA_ORIGINS=chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl"
```

読み直して再起動します。

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Windows

1. **設定 → システム → バージョン情報 → システムの詳細設定 → 環境変数** を開きます。
2. ユーザー変数 `OLLAMA_ORIGINS` を追加し、値に `chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl` を入れます。
3. トレイから Ollama を終了し、起動し直します。

### 自分でビルドした拡張機能

パッケージ化されていないビルドの ID は別です。`chrome://extensions` を開き、**デベロッパー モード** をオンにして、Sakutto のカードに出る ID を控えます。`chrome-extension://<そのID>` を使います。

`chrome-extension://*` でも動きますが、インストールしているすべての拡張機能を信頼することになります。ID を指定する方が安全です。

### 許可されたか確認する

```bash
curl -i \
  -H "Origin: chrome-extension://mhlbjjijfkoghmcjndgdimhdlfkhadfl" \
  http://127.0.0.1:11434/api/tags
```

`200 OK` と `Access-Control-Allow-Origin` が返れば許可されています。`403` なら Ollama が新しい値を読んでいません。完全に終了して起動し直してください。

## 4. Sakutto を設定する

1. 拡張機能の設定画面を開きます。
2. **ローカル Ollama** の **翻訳エンジン** で **ローカル Ollama** を選びます。
3. URL は、Ollama が別の場所になければ `http://127.0.0.1:11434` のままにします。
4. **モデル名** に `ollama list` で見た名前を入れます。
5. **アクセスを許可** を押し、Chrome の確認を承認します。
6. **接続を確認** を押します。「接続できました。モデルも見つかりました。」と出れば準備完了です。
7. いつもどおり、ページ、選択範囲、入力したテキストを翻訳します。

権限は Ollama のオリジンだけに対するものです。インストール時にすべてのサイトへのアクセスを求めることはなく、開発者へ何かを送ることもありません。

## モデルの選び方

- **2B Q4_K_M** が最初の候補です。0.8B のブラウザ内モデルより明確に良く、ノート PC でも動きます。
- **8B Q4_K_M** は、モデル用に 8 GB ほど空けられるならさらに良いです。Apple silicon では Ollama が Metal 経由で GPU を使います。
- **31B** はワークステーションの GPU と 24 GB ほどのメモリが要ります。ノート PC 向けではありません。
- **Q5_K_M / Q8_0** はメモリを多く使う代わりに精度が少し上がります。**Q2_K / Q3_K_M** は小さく、精度は下がります。

モデルはいつでも切り替えられます。次のリクエストから新しい名前を使います。

## 拡張機能が送るもの

- `POST <設定した URL>/api/generate`。`raw: true`、`stream: true`、`temperature: 0`、`num_ctx: 4096`、テキストに合わせた `num_predict`、PLaMo の停止トークンを付けます。
- ブラウザ内エンジンと同じ PFML3 のプロンプト。用語集とページの文脈も含みます。
- それ以外はありません。開発者がページの本文、選択範囲、用語集、訳文を受け取ることはありません。

Sakutto は Ollama へ一度に 1 つの補完しか送りません。段落ごとに `num_ctx` を全部使え、Ollama が並列の系列に文脈を分割するのを避けられます。

## 困ったとき

| 症状                                                               | 原因                                        | 対処                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `403 Forbidden`                                                    | `OLLAMA_ORIGINS` に拡張機能のオリジンがない | 正確なオリジンを足して Ollama を再起動し、上の `curl` で確認する                                                  |
| `Ollama に接続できません`                                          | Ollama が動いていない、URL かポートが違う   | `ollama serve` を実行し、`curl http://127.0.0.1:11434/api/tags` を確認する                                        |
| `接続できましたが、モデルがありません`                             | モデル名が `ollama list` と一致していない   | モデルを取得するか、名前を正確に貼り付ける                                                                        |
| 最初の翻訳が遅い                                                   | Ollama がモデルを読み込んでいる             | 最初のトークンを待つ。次の段落からは読み込み済みのモデルを使う                                                    |
| メモリが足りない                                                   | モデルか文脈が大きすぎる                    | 小さい量子化かモデルにする。GPU を多く使う他のアプリを閉じる                                                      |
| アクセスが許可されない                                             | Chrome の確認を閉じてしまった               | もう一度 **アクセスを許可** を押す。URL を変えた場合は新しいオリジンを許可する                                    |
| ページが原文のまま                                                 | 途中で Ollama が失敗した                    | 設定画面の状態を確認する。ブラウザ内モデルへは自動で切り替わらない                                                |
| 選択は「ローカル Ollama」なのに「Ollama は選ばれていません」と出る | エンジン側が保存済みの設定を読めていない    | offscreen ドキュメントは `chrome.storage` を使えないため、background から設定を渡すようにした。拡張機能を更新する |

`ollama ps` を使うと、どのモデルが読み込まれているか、いつまで保持されるかがわかります。Sakutto は最後のリクエストから 30 分間の保持を Ollama に頼みます。

## セキュリティ

Ollama には認証がありません。認証付きのプロキシを前に置いていない限り、`127.0.0.1` に置いたままにしてください。信頼できないネットワークで `OLLAMA_HOST=0.0.0.0` を設定しないでください。

`chrome-extension://*` より、拡張機能の ID を正確に指定する方が安全です。ワイルドカードはブラウザ内のすべての拡張機能を信頼し、そのどれでもローカルのモデルを使えるようになります。

## ライセンス

モデルは PLaMo 3 Translate で、PLaMo Community License に従います。Ollama と llama.cpp にはそれぞれのライセンスがあります。[NOTICE](../NOTICE) と [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) を参照してください。

English version: [OLLAMA.md](OLLAMA.md).
