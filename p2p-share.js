/* SFC近距離共有: QR + WebRTC DataChannel (PeerJS signaling only) */
(()=>{
  "use strict";

  const SESSION_TTL_MS=10*60*1000;
  const CONNECT_TIMEOUT_MS=25000;
  const CHUNK_SIZE=16*1024;
  const MAX_BUFFERED_BYTES=512*1024;
  const PEERJS_URL="https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js";
  const PEERJS_INTEGRITY="sha512-XEKeWX+mI3Ov+tg2evDlVQFzVOIp4T8J3cNcCEPaEUGpxJV3eZaN8rHuvnFPvQpGJBHPmrozJDMpm2xcDvtmyQ==";
  const QRCODE_URL="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
  const QRCODE_INTEGRITY="sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==";

  let peer=null;
  let connection=null;
  let senderSession=null;
  let receiverSession=null;
  let expiryTimer=0;
  let connectionTimer=0;
  let transferActive=false;
  let dependenciesPromise=null;

  function addStyle(){
    const style=document.createElement("style");
    style.textContent=`
      #nearbyShareModal{display:none;position:fixed;inset:0;z-index:270;align-items:center;justify-content:center;padding:14px;box-sizing:border-box;background:rgba(0,0,0,.58)}
      #nearbyShareBox{width:min(350px,94vw);max-height:calc(100dvh - 28px);overflow:auto;box-sizing:border-box;padding:13px;border:1px solid var(--border);border-radius:13px;background:var(--panel2);color:var(--fg);box-shadow:0 15px 38px rgba(0,0,0,.46)}
      #nearbyShareHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
      #nearbyShareTitle{font-size:15px;font-weight:800}
      #nearbyShareCloseBtn{min-width:62px;min-height:32px;padding:4px 9px;font-size:12px}
      #nearbyShareStatus{font-size:13px;line-height:1.65;text-align:center;white-space:pre-line}
      #nearbyShareQr{display:none!important;width:274px!important;height:274px!important;min-width:274px!important;min-height:274px!important;max-width:274px!important;max-height:274px!important;aspect-ratio:1/1!important;margin:10px auto!important;padding:15px!important;overflow:hidden!important;box-sizing:border-box!important;border-radius:10px;background:#fff;flex:none!important;align-items:center;justify-content:center}
      #nearbyShareQr[style*="flex"]{display:flex!important}
      #nearbyShareQr img,#nearbyShareQr canvas,#nearbyShareQr table{width:244px!important;height:244px!important;min-width:244px!important;min-height:244px!important;max-width:244px!important;max-height:244px!important;aspect-ratio:1/1!important;object-fit:contain!important;margin:0!important;padding:0!important;border:0!important;box-sizing:border-box!important}
      #nearbyShareQr table{display:table!important}
      #nearbyShareFile{margin-top:7px;font-size:12px;font-weight:800;text-align:center;overflow-wrap:anywhere}
      #nearbyShareExpire{margin-top:5px;font-size:11px;color:var(--muted);text-align:center}
      #nearbyShareProgressWrap{display:none;margin:12px 0 4px}
      #nearbyShareProgressTrack{height:8px;border-radius:999px;overflow:hidden;background:rgba(128,128,128,.34)}
      #nearbyShareProgressFill{width:0;height:100%;background:#1677ff;transition:width .08s linear}
      #nearbyShareProgressText{margin-top:6px;font-size:12px;text-align:center;font-variant-numeric:tabular-nums}
      #nearbyShareActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
      #nearbyShareActions button{min-height:38px;font-size:13px;font-weight:700}
      #nearbyShareApproveBtn{display:none;background:#1677ff;color:#fff;border-color:#0f5ec8}
      #nearbyShareDenyBtn{display:none}
      #nearbyShareRetryBtn{display:none;background:#1677ff;color:#fff;border-color:#0f5ec8}
      #nearbyShareCancelBtn{grid-column:1/-1}
      #nearbyShareSafety{margin-top:10px;padding-top:9px;border-top:1px solid rgba(128,128,128,.28);font-size:10px;line-height:1.55;color:var(--muted)}
      #saveMenuNearbyBtn{background:#138a62;color:#fff;border-color:#0d6d4d}
      #saveMenuNearbyBtn:disabled{opacity:.35;filter:grayscale(.4)}
    `;
    document.head.appendChild(style);
  }

  function addUi(){
    const menuActions=document.getElementById("saveMenuActions");
    const cancel=document.getElementById("saveMenuCancelBtn");
    if(menuActions&&!document.getElementById("saveMenuNearbyBtn")){
      const button=document.createElement("button");
      button.id="saveMenuNearbyBtn";
      button.type="button";
      button.textContent="近くの人へ送る";
      button.disabled=typeof hasLoadedDrawing==="function"?!hasLoadedDrawing():true;
      menuActions.insertBefore(button,cancel||null);
      button.addEventListener("click",startSenderShare);
      document.getElementById("openIconBtn")?.addEventListener("click",()=>{
        button.disabled=typeof hasLoadedDrawing==="function"?!hasLoadedDrawing():true;
      },true);
    }

    const modal=document.createElement("div");
    modal.id="nearbyShareModal";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","nearbyShareTitle");
    modal.innerHTML=`
      <div id="nearbyShareBox">
        <div id="nearbyShareHeader"><div id="nearbyShareTitle">近くの人へ送る</div><button id="nearbyShareCloseBtn" type="button">閉じる</button></div>
        <div id="nearbyShareStatus"></div>
        <div id="nearbyShareQr" aria-label="受信用QRコード"></div>
        <div id="nearbyShareFile"></div>
        <div id="nearbyShareExpire"></div>
        <div id="nearbyShareProgressWrap">
          <div id="nearbyShareProgressTrack"><div id="nearbyShareProgressFill"></div></div>
          <div id="nearbyShareProgressText"></div>
        </div>
        <div id="nearbyShareActions">
          <button id="nearbyShareApproveBtn" type="button">送信を許可</button>
          <button id="nearbyShareDenyBtn" type="button">許可しない</button>
          <button id="nearbyShareRetryBtn" type="button">もう一度試す</button>
          <button id="nearbyShareCancelBtn" type="button">キャンセル</button>
        </div>
        <div id="nearbyShareSafety">図面は端末側で暗号化して転送し、接続を仲介するサーバーには保存しません。QRは10分・受信1台限りです。</div>
      </div>`;
    document.body.appendChild(modal);
    byId("nearbyShareCloseBtn").addEventListener("click",closeShareModal);
    byId("nearbyShareCancelBtn").addEventListener("click",closeShareModal);
    byId("nearbyShareApproveBtn").addEventListener("click",approveReceiver);
    byId("nearbyShareDenyBtn").addEventListener("click",denyReceiver);
    byId("nearbyShareRetryBtn").addEventListener("click",retryReceiver);
    modal.addEventListener("click",event=>{if(event.target===modal)closeShareModal();});
  }

  function byId(id){return document.getElementById(id);}
  function setStatus(text){const el=byId("nearbyShareStatus");if(el)el.textContent=text||"";}
  function setFileText(text){const el=byId("nearbyShareFile");if(el)el.textContent=text||"";}
  function showModal(){byId("nearbyShareModal").style.display="flex";document.getElementById("openIconBtn")?.classList.add("modeActive");}
  function setActionVisibility({approve=false,deny=false,retry=false,cancel=true}={}){
    byId("nearbyShareApproveBtn").style.display=approve?"block":"none";
    byId("nearbyShareDenyBtn").style.display=deny?"block":"none";
    byId("nearbyShareRetryBtn").style.display=retry?"block":"none";
    byId("nearbyShareCancelBtn").style.display=cancel?"block":"none";
  }
  function setProgress(value,label){
    const safe=Math.max(0,Math.min(1,Number(value)||0));
    byId("nearbyShareProgressWrap").style.display="block";
    byId("nearbyShareProgressFill").style.width=`${(safe*100).toFixed(1)}%`;
    byId("nearbyShareProgressText").textContent=label||`${Math.round(safe*100)}%`;
  }
  function hideProgress(){byId("nearbyShareProgressWrap").style.display="none";}
  function formatBytes(bytes){
    const size=Math.max(0,Number(bytes)||0);
    if(size<1024)return `${size} B`;
    if(size<1024*1024)return `${(size/1024).toFixed(1)} KB`;
    return `${(size/1024/1024).toFixed(1)} MB`;
  }
  function deviceLabel(){
    const ua=navigator.userAgent||"";
    if(/iPhone|iPad|iPod/i.test(ua))return "iPhone/iPad";
    if(/Android/i.test(ua))return "Android";
    return "PC・その他の端末";
  }
  function loadScriptOnce(src,globalName,integrity){
    if(window[globalName])return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(script=>script.src===src);
      if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return;}
      const script=document.createElement("script");
      script.src=src;script.async=true;script.crossOrigin="anonymous";script.integrity=integrity;
      script.onload=()=>window[globalName]?resolve():reject(new Error(`${globalName}を読み込めません`));
      script.onerror=()=>reject(new Error(`${globalName}を読み込めません`));
      document.head.appendChild(script);
    });
  }
  function loadDependencies(){
    if(!dependenciesPromise)dependenciesPromise=Promise.all([
      loadScriptOnce(PEERJS_URL,"Peer",PEERJS_INTEGRITY),
      loadScriptOnce(QRCODE_URL,"QRCode",QRCODE_INTEGRITY)
    ]).catch(error=>{dependenciesPromise=null;throw error;});
    return dependenciesPromise;
  }
  function randomToken(byteLength=32){
    const bytes=crypto.getRandomValues(new Uint8Array(byteLength));
    return base64Url(bytes);
  }
  function base64Url(bytes){
    let binary="";const src=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    for(let i=0;i<src.length;i+=0x8000)binary+=String.fromCharCode(...src.subarray(i,i+0x8000));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
  }
  function fromBase64Url(value){
    const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
    const binary=atob(normalized+"===".slice((normalized.length+3)%4));
    const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
  }
  async function hmac(token,message){
    const key=await crypto.subtle.importKey("raw",fromBase64Url(token),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    return base64Url(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));
  }
  async function encryptBytes(token,plain){
    const key=await crypto.subtle.importKey("raw",fromBase64Url(token),"AES-GCM",false,["encrypt"]);
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
    return {cipher:new Uint8Array(cipher),iv:base64Url(iv)};
  }
  async function decryptBytes(token,cipher,iv){
    const key=await crypto.subtle.importKey("raw",fromBase64Url(token),"AES-GCM",false,["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:fromBase64Url(iv)},key,cipher));
  }
  function safeEqual(a,b){
    a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;
    let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
  }
  function cleanFileName(name){return String(name||"drawing.sfc").replace(/[\\/:*?"<>|\r\n]/g,"_").replace(/\.html?$/i,".sfc")||"drawing.sfc";}

  async function startSenderShare(){
    if(typeof hasLoadedDrawing!=="function"||!hasLoadedDrawing()){
      showToast?.("先にSFC図面を開いてください",1800);return;
    }
    setSaveMenuOpen?.(false);
    resetSession();
    receiverSession=null;
    showModal();hideProgress();setActionVisibility({cancel:true});
    byId("nearbyShareTitle").textContent="近くの人へ送る";
    byId("nearbyShareQr").style.display="none";
    byId("nearbyShareExpire").textContent="";
    setStatus("送信用データを準備しています…");
    try{
      await loadDependencies();
      const exported=buildSfcExportBlobAndName();
      if(!exported?.ok)throw new Error(exported?.reason||"SFCを準備できません");
      const name=cleanFileName(exported.overwriteName||exported.saveAsName);
      const plain=await exported.blob.arrayBuffer();
      senderSession={token:randomToken(),name,plain,expiresAt:Date.now()+SESSION_TTL_MS,pending:null,used:false};
      setFileText(`${name}（${formatBytes(plain.byteLength)}）`);
      setStatus("接続用QRを作っています…");
      peer=new Peer(undefined,{debug:0});
      connectionTimer=window.setTimeout(()=>failShare("接続を開始できません。同じWi-Fiまたはテザリングで再度お試しください。",true),CONNECT_TIMEOUT_MS);
      peer.on("open",id=>{
        clearTimeout(connectionTimer);
        if(!senderSession)return;
        const url=new URL(location.href);url.hash=`nearby=${id}.${senderSession.token}`;
        senderSession.shareUrl=url.href;
        const qr=byId("nearbyShareQr");qr.innerHTML="";qr.style.display="flex";
        new QRCode(qr,{text:url.href,width:244,height:244,colorDark:"#000000",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
        const qrGraphic=qr.querySelector("canvas,img,table");
        if(qrGraphic){
          qrGraphic.style.setProperty("width","244px","important");
          qrGraphic.style.setProperty("height","244px","important");
          qrGraphic.style.setProperty("aspect-ratio","1 / 1","important");
        }
        setStatus("相手のスマホの標準カメラでQRを読み取ってください\n（iPhoneはコードスキャナーへの切替不要です）");
        startExpiryCountdown();
      });
      peer.on("connection",handleSenderConnection);
      peer.on("error",error=>{if(!transferActive)failShare(peerErrorText(error),true);});
    }catch(error){console.error(error);failShare(error?.message||"送信を準備できません",true);}
  }

  function handleSenderConnection(conn){
    if(!senderSession||senderSession.used||Date.now()>senderSession.expiresAt){try{conn.close();}catch(_){ }return;}
    if(senderSession.pending&&senderSession.pending!==conn){try{conn.close();}catch(_){ }return;}
    senderSession.pending=conn;connection=conn;
    conn.on("data",message=>handleSenderMessage(conn,message).catch(error=>{console.error(error);failShare("安全な接続を確認できません",true);}));
    conn.on("close",()=>{if(transferActive)failShare("転送が途中で切れました",true);});
    conn.on("error",()=>failShare("相手との接続に失敗しました",true));
  }

  async function handleSenderMessage(conn,message){
    if(!senderSession||conn!==senderSession.pending||!message||typeof message!=="object")return;
    if(message.type==="hello"){
      const expected=await hmac(senderSession.token,`receiver:${message.nonce||""}`);
      if(!safeEqual(expected,message.proof)){
        senderSession.pending=null;
        conn.send({type:"denied"});conn.close();return;
      }
      senderSession.receiverNonce=message.nonce;
      senderSession.receiverLabel=String(message.device||"相手の端末").slice(0,40);
      clearInterval(expiryTimer);
      setStatus(`${senderSession.receiverLabel}から受信希望が届きました。\nこの端末へ図面を送りますか？`);
      byId("nearbyShareQr").style.display="none";
      byId("nearbyShareExpire").textContent="";
      setActionVisibility({approve:true,deny:true,cancel:true});
      return;
    }
    if(message.type==="ready"&&senderSession.approved){
      await sendEncryptedFile(conn);return;
    }
    if(message.type==="received"){
      transferActive=false;setProgress(1,"送信完了");
      setStatus("相手の端末で図面が開きました");setActionVisibility({cancel:false});
      byId("nearbyShareCloseBtn").textContent="閉じる";
      window.setTimeout(()=>{try{conn.close();}catch(_){ }},500);
    }
  }

  async function approveReceiver(){
    if(!senderSession?.pending||!senderSession.receiverNonce)return;
    senderSession.approved=true;senderSession.used=true;clearInterval(expiryTimer);
    setActionVisibility({cancel:true});setStatus("安全な接続を確認しています…");
    const proof=await hmac(senderSession.token,`sender:${senderSession.receiverNonce}`);
    senderSession.pending.send({type:"authorized",proof});
  }
  function denyReceiver(){
    try{senderSession?.pending?.send({type:"denied"});senderSession?.pending?.close();}catch(_){ }
    if(senderSession){senderSession.pending=null;senderSession.receiverNonce="";senderSession.used=true;}
    try{peer?.destroy();}catch(_){ }
    peer=null;connection=null;
    setStatus("送信を許可しませんでした");setActionVisibility({cancel:false});
  }
  async function sendEncryptedFile(conn){
    if(transferActive||!senderSession)return;
    transferActive=true;setStatus("図面を暗号化して送信しています…");
    const encrypted=await encryptBytes(senderSession.token,senderSession.plain);
    const total=Math.ceil(encrypted.cipher.length/CHUNK_SIZE);
    conn.send({type:"meta",name:senderSession.name,size:senderSession.plain.byteLength,cipherSize:encrypted.cipher.length,total,iv:encrypted.iv});
    for(let index=0;index<total;index++){
      if(!conn.open)throw new Error("接続が切れました");
      await waitForBuffer(conn);
      const start=index*CHUNK_SIZE;
      const chunk=encrypted.cipher.slice(start,Math.min(encrypted.cipher.length,start+CHUNK_SIZE));
      conn.send({type:"chunk",index,data:chunk.buffer});
      const sent=Math.min(encrypted.cipher.length,start+chunk.length);
      setProgress(sent/encrypted.cipher.length,`${formatBytes(Math.min(senderSession.plain.byteLength,sent))} / ${formatBytes(senderSession.plain.byteLength)}　${Math.round(sent/encrypted.cipher.length*100)}%`);
      if(index%16===15)await new Promise(resolve=>setTimeout(resolve,0));
    }
    await waitForBuffer(conn,0);
    conn.send({type:"done"});setStatus("相手の端末で図面を開いています…");
  }
  function waitForBuffer(conn,target=MAX_BUFFERED_BYTES){
    return new Promise((resolve,reject)=>{
      const check=()=>{
        if(!conn?.open){reject(new Error("接続が切れました"));return;}
        const amount=Number(conn.dataChannel?.bufferedAmount||0);
        if(amount<=target){resolve();return;}
        setTimeout(check,12);
      };check();
    });
  }
  function startExpiryCountdown(){
    clearInterval(expiryTimer);
    const update=()=>{
      if(!senderSession)return;
      const seconds=Math.max(0,Math.ceil((senderSession.expiresAt-Date.now())/1000));
      byId("nearbyShareExpire").textContent=`このQRはあと${Math.floor(seconds/60)}分${String(seconds%60).padStart(2,"0")}秒で無効になります`;
      if(seconds<=0){clearInterval(expiryTimer);failShare("QRの有効期限が切れました",true);}
    };update();expiryTimer=window.setInterval(update,1000);
  }

  function consumeReceiveRequest(){
    try{
      const raw=sessionStorage.getItem("sfc-nearby-receive");sessionStorage.removeItem("sfc-nearby-receive");
      if(!raw)return null;const parsed=JSON.parse(raw);
      if(!parsed?.peerId||!parsed?.token||Date.now()-Number(parsed.savedAt||0)>SESSION_TTL_MS)return null;
      return parsed;
    }catch(_){return null;}
  }
  async function startReceiver(request){
    resetSession();receiverSession={...request,chunks:null,meta:null,authorized:false};
    showModal();hideProgress();setActionVisibility({cancel:true});
    byId("nearbyShareTitle").textContent="図面を受信";
    byId("nearbyShareQr").style.display="none";byId("nearbyShareExpire").textContent="";setFileText("");
    setStatus("送信者へ接続しています…");
    try{
      await loadDependencies();
      peer=new Peer(undefined,{debug:0});
      connectionTimer=window.setTimeout(()=>failShare("送信者へ接続できません。同じWi-Fiまたはテザリングで再度お試しください。",true),CONNECT_TIMEOUT_MS);
      peer.on("open",()=>{
        connection=peer.connect(receiverSession.peerId,{reliable:true,serialization:"binary",metadata:{device:deviceLabel()}});
        connection.on("open",async()=>{
          clearTimeout(connectionTimer);
          const nonce=randomToken(16);receiverSession.nonce=nonce;
          const proof=await hmac(receiverSession.token,`receiver:${nonce}`);
          connection.send({type:"hello",nonce,proof,device:deviceLabel()});
          setStatus("送信者の許可を待っています…");
        });
        connection.on("data",message=>handleReceiverMessage(message).catch(error=>{console.error(error);failShare("受信データを確認できません",true);}));
        connection.on("close",()=>{if(transferActive)failShare("受信が途中で切れました",true);});
        connection.on("error",()=>failShare("送信者へ接続できません",true));
      });
      peer.on("error",error=>failShare(peerErrorText(error),true));
    }catch(error){console.error(error);failShare(error?.message||"受信を開始できません",true);}
  }
  async function handleReceiverMessage(message){
    if(!receiverSession||!message||typeof message!=="object")return;
    if(message.type==="denied"){
      transferActive=false;setStatus("送信者が送信を許可しませんでした");setActionVisibility({cancel:false});return;
    }
    if(message.type==="authorized"){
      const expected=await hmac(receiverSession.token,`sender:${receiverSession.nonce}`);
      if(!safeEqual(expected,message.proof)){throw new Error("送信者の確認に失敗しました");}
      receiverSession.authorized=true;connection.send({type:"ready"});setStatus("図面を受信しています…");return;
    }
    if(message.type==="meta"&&receiverSession.authorized){
      const total=Math.max(0,Math.trunc(Number(message.total)||0));
      const cipherSize=Math.max(0,Math.trunc(Number(message.cipherSize)||0));
      if(!total||total>20000||!cipherSize||cipherSize>300*1024*1024)throw new Error("ファイルサイズが不正です");
      receiverSession.meta={name:cleanFileName(message.name),size:Number(message.size)||0,cipherSize,total,iv:String(message.iv||"")};
      receiverSession.chunks=new Array(total);receiverSession.receivedBytes=0;transferActive=true;
      setFileText(`${receiverSession.meta.name}（${formatBytes(receiverSession.meta.size)}）`);setProgress(0,`0 / ${formatBytes(receiverSession.meta.size)}　0%`);return;
    }
    if(message.type==="chunk"&&receiverSession.chunks){
      const index=Math.trunc(Number(message.index));if(index<0||index>=receiverSession.chunks.length||receiverSession.chunks[index])return;
      const bytes=message.data instanceof Uint8Array?message.data:new Uint8Array(message.data);
      receiverSession.chunks[index]=bytes;receiverSession.receivedBytes+=bytes.byteLength;
      const ratio=Math.min(1,receiverSession.receivedBytes/receiverSession.meta.cipherSize);
      setProgress(ratio,`${formatBytes(Math.min(receiverSession.meta.size,receiverSession.receivedBytes))} / ${formatBytes(receiverSession.meta.size)}　${Math.round(ratio*100)}%`);return;
    }
    if(message.type==="done"&&receiverSession.chunks){await finishReceiving();}
  }
  async function finishReceiving(){
    const meta=receiverSession.meta;
    if(receiverSession.chunks.some(chunk=>!chunk))throw new Error("一部のデータを受信できませんでした");
    setStatus("暗号を解除して図面を開いています…");setProgress(1,"受信完了・図面を開いています");
    const cipher=new Uint8Array(meta.cipherSize);let offset=0;
    for(const chunk of receiverSession.chunks){cipher.set(chunk,offset);offset+=chunk.byteLength;}
    const plain=await decryptBytes(receiverSession.token,cipher,meta.iv);
    if(plain.byteLength!==meta.size)throw new Error("受信サイズが一致しません");
    const source=bytesToLatin1String(plain);
    await handleLoadedSource(source,meta.name,null);
    transferActive=false;connection?.send({type:"received"});
    setStatus("図面を受信して開きました");setProgress(1,"受信完了");setActionVisibility({cancel:false});
    window.setTimeout(closeShareModal,1100);
  }
  function retryReceiver(){
    const request=receiverSession?{peerId:receiverSession.peerId,token:receiverSession.token,savedAt:Date.now()}:null;
    if(request)startReceiver(request);
  }
  function peerErrorText(error){
    const type=String(error?.type||"");
    if(type==="peer-unavailable")return "送信用QRの有効期限が切れているか、送信画面が閉じられています";
    if(type==="network"||type==="server-error"||type==="socket-error")return "接続仲介サービスへつながりません。通信状態を確認してください";
    if(type==="browser-incompatible")return "このブラウザーは端末間転送に対応していません";
    return "端末間の接続に失敗しました";
  }
  function failShare(message,retry){
    transferActive=false;clearTimeout(connectionTimer);clearInterval(expiryTimer);
    try{connection?.close();}catch(_){ }try{peer?.destroy();}catch(_){ }
    connection=null;peer=null;
    setStatus(message);hideProgress();byId("nearbyShareQr").style.display="none";byId("nearbyShareExpire").textContent="";
    setActionVisibility({retry:!!retry&&!!receiverSession,cancel:false});
  }
  function resetSession(){
    clearTimeout(connectionTimer);clearInterval(expiryTimer);transferActive=false;
    try{connection?.close();}catch(_){ }try{peer?.destroy();}catch(_){ }
    peer=null;connection=null;senderSession=null;
  }
  function closeShareModal(){
    if(transferActive&&!confirm("転送を中止しますか？"))return;
    resetSession();receiverSession=null;
    const modal=byId("nearbyShareModal");if(modal)modal.style.display="none";
    document.getElementById("openIconBtn")?.classList.remove("modeActive");
  }

  addStyle();addUi();
  const receiveRequest=consumeReceiveRequest();
  if(receiveRequest)window.setTimeout(()=>startReceiver(receiveRequest),0);
})();
