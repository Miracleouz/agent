// A burst may request another pass, but cannot continually postpone a refresh
// or invalidate every response with a newer overlapping request.
export function liveRefresh(refresh,{delay=250}={}){
 let closed=false,running=false,dirty=false,timer=null;
 const request=()=>{if(closed)return;dirty=true;if(running||timer!==null)return;timer=setTimeout(async()=>{timer=null;if(closed)return;running=true;dirty=false;try{await refresh();}finally{running=false;if(dirty&&!closed)request();}},delay);};
 return{request,close(){closed=true;clearTimeout(timer);timer=null;}};
}
