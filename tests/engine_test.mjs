// 手機版大腦測試：node tests/engine_test.mjs
//   需要環境變數 GROQ_API_KEY（測真的辨識）；OPENCC_UMD 指向 opencc-js 的 dist/umd/full.js（測簡轉繁）
import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
if (process.env.OPENCC_UMD) {
  // UMD 檔會把 OpenCC 掛在 globalThis 上
  (0, eval)(readFileSync(process.env.OPENCC_UMD, "utf8"));
}
const JLS = require(join(here, "..", "engine.js"));
const { fixes } = JLS.parseDictionary(JLS.DEFAULT_DICT);

let fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "通過" : "失敗"} ${name}${ok ? "" : `\n   得到 ${JSON.stringify(got)}\n   應為 ${JSON.stringify(want)}`}`);
}

// 1. 規則整理：跟電腦版 engine.py 的結果一模一樣
const R = t => JLS.finalize(JLS.cleanupRules(t), fixes);
eq("小頓號＋贅字＋換行", R("恩﹑那個﹑這週五晚上的小組﹑我們要讀以弗所書第二章﹑換行﹑然後﹑呃﹑請大家先想一下﹑彌賽亞為什麼要來到世上﹑"),
  "這週五晚上的小組，我們要讀以弗所書第二章\n然後，請大家先想一下，彌賽亞為什麼要來到世上。");
eq("問號指令", R("幫我寫一首關於五旬節的詩,問號。"), "幫我寫一首關於五旬節的詩？");
eq("恩典額外不誤刪", R("神的恩典夠我們用,額外的事情嗯,下次再說"), "神的恩典夠我們用，額外的事情下次再說");
eq("好啊保留", R("啊,好啊,恩,我知道了"), "好啊，我知道了");
eq("換行程不誤判", R("我們換行程好了"), "我們換行程好了");
eq("幻行當換行", R("第二章，幻行，然後"), "第二章\n然後");
eq("英文標點不動", R("這個project下週要交,OK嗎?Please reply, thanks."), "這個project下週要交，OK嗎？Please reply, thanks.");
eq("必換詞", R("我們讀以福所書"), "我們讀以弗所書");

// 2. 簡轉繁：只轉真的簡體，不改壞正確繁體
if (globalThis.OpenCC) {
  const F = t => JLS.finalize(t, []);
  eq("干擾不變幹擾", F("不要干擾小組"), "不要干擾小組");
  eq("祢台保留", F("主啊，祢是我的力量，台灣的教會"), "主啊，祢是我的力量，台灣的教會");
  eq("簡體轉繁體", F("这周五晚上的小组，我们要读以弗所书，不要干扰。"), "這週五晚上的小組，我們要讀以弗所書，不要干擾。");
  eq("簡體裡的祢台", F("主啊，祢是我的力量，台湾的教会"), "主啊，祢是我的力量，台灣的教會");
  // 雲端整理失敗時：簡體辨識結果要先轉繁體，「换行」才認得（processAudio 的順序）
  eq("簡體换行走規則整理", JLS.finalize(JLS.cleanupRules(JLS.toTraditional("嗯,那個,这周五晚上的小组,不要干扰,换行,然后祢是我的力量")), []),
    "這週五晚上的小組，不要干擾\n然後祢是我的力量");
} else {
  console.log("（沒設 OPENCC_UMD，跳過簡轉繁測試）");
}

// 3. 真的打 Groq
const key = process.env.GROQ_API_KEY;
if (key) {
  for (const [f, mustHave, mustNot] of [
    ["t1.wav", ["以弗所書", "彌賽亞", "\n"], ["嗯", "呃", "換行"]],
    ["t2.wav", ["五旬節", "？"], ["問號"]],
  ]) {
    const blob = new Blob([readFileSync(join(here, f))], { type: "audio/wav" });
    const r = await JLS.processAudio(blob, { filename: f, key });
    const ok = mustHave.every(s => r.text.includes(s)) && !mustNot.some(s => r.text.includes(s)) && r.text.length < 80;
    if (!ok) fail++;
    console.log(`${ok ? "通過" : "失敗"} 雲端 ${f}［${r.route}，${r.secs.toFixed(1)} 秒，${r.model}］\n   ${JSON.stringify(r.text)}`);
  }
} else {
  console.log("（沒設 GROQ_API_KEY，跳過雲端測試）");
}

console.log(fail ? `有 ${fail} 項失敗` : "全部通過");
process.exit(fail ? 1 : 0);
