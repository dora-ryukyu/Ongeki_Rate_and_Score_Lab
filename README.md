# Ongeki Rate & Score Lab 📊✨

オンゲキのスコアとレートの相互計算、そして必要な情報の探索をサポートするモダンなWebアプリケーションです。

[![GitHub Pages Deploy](https://github.com/dora-ryukyu/Ongeki_Rate_and_Score_Lab/actions/workflows/deploy.yml/badge.svg)](https://dora-ryukyu.github.io/Ongeki_Rate_and_Score_Lab/) <!-- Replace with your actual badge URL if you set up Actions -->
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**サイトURL:** [https://dora-ryukyu.github.io/Ongeki_Rate_and_Score_Lab/](https://dora-ryukyu.github.io/Ongeki_Rate_and_Score_Lab/) <!-- Replace with your actual GitHub Pages URL -->

## 🚀 主な機能

*   **双方向計算:**
    *   **スコア → レート:** 楽曲スコアと各種ボーナスから、得られる単曲レートを精密に計算します。
    *   **レート → スコア:** 目標とする単曲レートを達成するために必要なスコアの目安を算出します。
*   **スマートな楽曲検索:**
    *   曲名（部分一致）または譜面定数（例: `14.7`）で、膨大な楽曲リストから素早く目的の譜面を検索できます。
    *   LUNATIC譜面も区別して表示・選択可能です。
*   **インタラクティブな譜面選択:**
    *   検索結果から曲を選択すると、アコーディオン形式で難易度ボタン（イメージカラー適用済）が展開され、直感的に譜面を選べます。
*   **譜面定数の直接入力:**
    *   楽曲検索を使わず、既知の譜面定数を直接入力して計算することも可能です。
*   **各種ボーナス対応:**
    *   ランプボーナス（FC, AB, AB+）とFULL BELLボーナスの有無を考慮した計算が可能です。
*   **洗練されたUI/UX:**
    *   システム設定に連動するダーク/ライトテーマ。
    *   Google Fonts を利用した見やすいタイポグラフィ。
    *   スムーズなアニメーションと直感的な操作フロー。
    *   レスポンシブデザインで、どのデバイスからでも快適に利用できます。

## 🛠️ 使用技術

*   **フロントエンド:** HTML5, CSS3 (Variables, Grid, Flexbox), Vanilla JavaScript (ES6+)
*   **楽曲データ:** [reiwa.f5.si](https://reiwa.f5.si/) 提供の外部JSON API (`ongeki_all.json`) を利用。
*   **アイコン:** [Feather Icons](https://feathericons.com/)
*   **フォント:** [Google Fonts](https://fonts.google.com/) (Poppins, Noto Sans JP)
*   **ホスティング:** GitHub Pages

## 使い方

1.  **譜面を選択 or 定数を入力:**
    *   上部の検索ボックスに**曲名**または**譜面定数**を入力して検索します。
    *   検索結果の曲をクリックすると、難易度ボタンが表示されます。
    *   目的の難易度ボタンをクリックすると、譜面定数が自動入力されます。
    *   または、**譜面定数入力欄に直接数値を入力**することも可能です。
2.  **計算モードを選択:**
    *   「Score → Rate」（デフォルト）または「Rate → Score」のボタンで計算の方向を切り替えます。
3.  **必要な値を入力:**
    *   計算に必要なスコアまたは目標レートを入力します。
    *   達成した（または目標とする）ランプボーナスとFULL BELLボーナスを選択します。
4.  **結果を確認:**
    *   入力が完了すると、計算結果が下部の結果エリアにリアルタイムで表示されます。
    *   入力値が無効な場合や、計算不能な場合はエラーメッセージが表示されます。

## 注意事項

*   計算結果は、既知の計算式に基づいた**参考値**です。ゲーム内での実際のレート変動と完全に一致しない場合があります。
*   楽曲データは外部APIに依存しているため、APIの更新状況や利用可能性によって情報が変動する可能性があります。
*   入力は半角数字で行ってください。

## 今後の展望 (Ideas)

*   お気に入り楽曲/譜面の登録機能
*   計算結果の履歴表示
*   レート計算の詳細（各ボーナスの内訳）表示
*   UIテーマのカスタマイズオプション

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。
