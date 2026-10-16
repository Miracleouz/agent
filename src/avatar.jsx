import React,{useEffect,useState} from 'react';
import {Users} from 'lucide-react';
export function Avatar({name,version,src,group=false,className='',children}){
 const[failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[version,src]);
 return <div className={'avatar '+className}>{version&&!failed?<img className="profile-photo" src={src+'?v='+encodeURIComponent(version)} alt={`Foto de ${name}`} loading="lazy" onError={()=>setFailed(true)}/>:group?<Users size={20}/>:String(name||'?').split(' ').slice(0,2).map(part=>part[0]).join('').toUpperCase()}{children}</div>;
}
