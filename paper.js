const methodFrame=document.getElementById('method-frame');
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==methodFrame.contentWindow)return;if(event.data?.type==='sharp-method-height'&&Number.isFinite(event.data.height))methodFrame.style.height=Math.max(600,Math.min(2200,event.data.height))+'px';});
