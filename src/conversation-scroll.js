import {useLayoutEffect,useRef} from 'react';

// Follow the live end only while the reader is already there. Keep a visible
// DOM anchor when history, receipts, transcripts or media change above it.
export function useConversationScroll(conversationId,messages){
 const container=useRef(null),position=useRef(null);
 const remember=()=>{
  const node=container.current;if(!node)return;
  const top=node.getBoundingClientRect().top,children=node.children;let lo=0,hi=children.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(children[mid].getBoundingClientRect().bottom<=top)lo=mid+1;else hi=mid;}
  const anchor=children[lo];position.current={id:conversationId,follow:node.scrollHeight-node.clientHeight-node.scrollTop<=64,top:node.scrollTop,anchor,offset:anchor?anchor.getBoundingClientRect().top-top:0};
 };
 const restore=()=>{
  if(!conversationId){position.current=null;return;}
  const node=container.current;if(!node)return;
  const saved=position.current;
  if(!saved||saved.id!==conversationId||saved.follow)node.scrollTop=node.scrollHeight;
  else if(saved.anchor?.parentElement===node)node.scrollTop+=saved.anchor.getBoundingClientRect().top-node.getBoundingClientRect().top-saved.offset;
  else node.scrollTop=saved.top;
  remember();
 };
 useLayoutEffect(restore,[conversationId,messages]);
 useLayoutEffect(()=>{
  const node=container.current;if(!node||!conversationId)return;
  node.addEventListener('scroll',remember,{passive:true});
  node.addEventListener('load',restore,true);node.addEventListener('loadedmetadata',restore,true);node.addEventListener('toggle',restore,true);
  const resize=new ResizeObserver(restore);resize.observe(node);
  return()=>{node.removeEventListener('scroll',remember);node.removeEventListener('load',restore,true);node.removeEventListener('loadedmetadata',restore,true);node.removeEventListener('toggle',restore,true);resize.disconnect();};
 },[conversationId]);
 return container;
}
