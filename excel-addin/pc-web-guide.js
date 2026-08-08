/* Android版からPC・iPhone向けWeb版へ案内する独立UI。 */
(()=>{
  "use strict";

  const WEB_URL="https://iku190t.github.io/ais-survey-tool/";
  const ANDROID_PACKAGE="jp.co.eyesurvey.ezviewer";
  const params=new URLSearchParams(location.search);
  const launchedFromAndroidApp=
    params.get("source")==="android_app" ||
    document.referrer.startsWith(`android-app://${ANDROID_PACKAGE}`) ||
    (/Android/i.test(navigator.userAgent) && (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches
    ));

  if(!launchedFromAndroidApp)return;

  const style=document.createElement("style");
  style.textContent=`
    #startupBox{max-height:calc(100% - 24px);overflow-y:auto;box-sizing:border-box}
    .pcWebEntry{margin-top:11px;padding-top:11px;border-top:1px solid rgba(0,0,0,.15);text-align:center}
    .pcWebEntryTitle{font-size:13px;font-weight:800;color:#222}
    .pcWebEntryText{margin:3px 0 8px;font-size:11px;line-height:1.55;color:#666}
    .pcWebEntryButton{min-height:34px;padding:7px 13px;border:1px solid #3979e8;border-radius:8px;background:#3979e8;color:#fff;font-size:12px;font-weight:800;cursor:pointer}
    .pcWebEntryButton:active{transform:translateY(1px) scale(.98);filter:brightness(.94)}
    #pcWebGuideModal{display:none;position:fixed;inset:0;z-index:280;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.62)}
    #pcWebGuideModal.open{display:flex}
    #pcWebGuideBox{width:min(340px,92vw);max-height:min(720px,88vh);overflow:auto;box-sizing:border-box;padding:14px;border:1px solid #555;border-radius:14px;background:#171717;color:#fff;box-shadow:0 16px 38px rgba(0,0,0,.48)}
    #pcWebGuideHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
    #pcWebGuideTitle{font-size:16px;font-weight:800}
    #pcWebGuideClose{min-width:62px;min-height:36px;border:1px solid #555;border-radius:9px;background:#303030;color:#fff;font-weight:700}
    #pcWebGuideText{margin:0 0 10px;font-size:12px;line-height:1.65;color:#ddd}
    #pcWebGuideQr{display:flex;align-items:center;justify-content:center;width:216px;height:216px;margin:0 auto 10px;border-radius:10px;background:#fff}
    #pcWebGuideQr canvas,#pcWebGuideQr img{display:block;max-width:200px;max-height:200px}
    #pcWebGuideUrl{display:block;width:100%;box-sizing:border-box;margin-bottom:9px;padding:9px;border:1px solid #555;border-radius:8px;background:#090909;color:#fff;font-size:12px;line-height:1.4;user-select:text;-webkit-user-select:text}
    #pcWebGuideActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #pcWebGuideActions button{min-height:38px;border:1px solid #555;border-radius:9px;background:#303030;color:#fff;font-size:12px;font-weight:800}
    #pcWebGuideCopy{background:#3979e8!important;border-color:#3979e8!important}
    #pcWebGuideStatus{min-height:18px;margin-top:7px;color:#9bc0ff;font-size:11px;text-align:center}
    #helpPcWebEntry{margin:12px 0 2px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
    #helpPcWebEntry .pcWebEntryTitle{color:var(--fg)}
    #helpPcWebEntry .pcWebEntryText{color:var(--muted)}
  `;
  document.head.append(style);

  const modal=document.createElement("div");
  modal.id="pcWebGuideModal";
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-labelledby","pcWebGuideTitle");
  modal.innerHTML=`
    <div id="pcWebGuideBox">
      <div id="pcWebGuideHeader">
        <div id="pcWebGuideTitle">PC・iPhoneで使う</div>
        <button id="pcWebGuideClose" type="button">閉じる</button>
      </div>
      <p id="pcWebGuideText">インストール不要のWeb版です。PCではURLを開き、iPhoneではSafariから利用できます。</p>
      <div id="pcWebGuideQr" aria-label="Ez Viewer Web版のQRコード"></div>
      <span id="pcWebGuideUrl">${WEB_URL}</span>
      <div id="pcWebGuideActions">
        <button id="pcWebGuideCopy" type="button">URLをコピー</button>
        <button id="pcWebGuideShare" type="button">共有</button>
      </div>
      <div id="pcWebGuideStatus" aria-live="polite"></div>
    </div>`;
  document.body.append(modal);

  const status=modal.querySelector("#pcWebGuideStatus");
  const qr=modal.querySelector("#pcWebGuideQr");
  let qrReady=false;

  function setStatus(message){status.textContent=message||"";}

  function loadQrLibrary(){
    if(window.QRCode)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-ezviewer-pc-qr]');
      if(existing){
        existing.addEventListener("load",resolve,{once:true});
        existing.addEventListener("error",reject,{once:true});
        return;
      }
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
      script.dataset.ezviewerPcQr="1";
      script.onload=resolve;
      script.onerror=reject;
      document.head.append(script);
    });
  }

  async function ensureQr(){
    if(qrReady)return;
    qr.textContent="QRを準備しています…";
    qr.style.color="#333";
    qr.style.fontSize="12px";
    try{
      await loadQrLibrary();
      qr.textContent="";
      new window.QRCode(qr,{
        text:WEB_URL,
        width:200,
        height:200,
        colorDark:"#000000",
        colorLight:"#ffffff",
        correctLevel:window.QRCode.CorrectLevel.M
      });
      qrReady=true;
    }catch(_error){
      qr.textContent="QRを表示できません。下のURLをコピーしてください。";
      qr.style.padding="16px";
      qr.style.boxSizing="border-box";
    }
  }

  function openGuide(){
    modal.classList.add("open");
    setStatus("");
    ensureQr();
  }

  function closeGuide(){modal.classList.remove("open");}

  async function copyUrl(){
    try{
      await navigator.clipboard.writeText(WEB_URL);
    }catch(_error){
      const area=document.createElement("textarea");
      area.value=WEB_URL;
      area.style.position="fixed";
      area.style.opacity="0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setStatus("Web版のURLをコピーしました");
  }

  modal.querySelector("#pcWebGuideClose").addEventListener("click",closeGuide);
  modal.querySelector("#pcWebGuideCopy").addEventListener("click",copyUrl);
  modal.querySelector("#pcWebGuideShare").addEventListener("click",async()=>{
    if(!navigator.share){await copyUrl();return;}
    try{
      await navigator.share({title:"Ez Viewer",text:"SFC図面をスマホ・PCで表示できるEz Viewerです。",url:WEB_URL});
    }catch(error){
      if(error?.name!=="AbortError")setStatus("共有できませんでした。URLをコピーしてください");
    }
  });
  modal.addEventListener("click",event=>{if(event.target===modal)closeGuide();});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&modal.classList.contains("open")){
      event.stopImmediatePropagation();
      closeGuide();
    }
  },true);

  function createEntry(id){
    const entry=document.createElement("div");
    entry.id=id;
    entry.className="pcWebEntry";
    entry.innerHTML=`
      <div class="pcWebEntryTitle">PCでも使えます</div>
      <div class="pcWebEntryText">PC・iPhoneはインストール不要のWeb版を利用できます。</div>
      <button class="pcWebEntryButton" type="button">PC・iPhoneで使う</button>`;
    entry.querySelector("button").addEventListener("click",openGuide);
    return entry;
  }

  const startupBox=document.getElementById("startupBox");
  if(startupBox)startupBox.append(createEntry("startupPcWebEntry"));

  const helpMenuView=document.getElementById("helpMenuView");
  if(helpMenuView)helpMenuView.append(createEntry("helpPcWebEntry"));
})();
