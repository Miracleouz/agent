import {normalize} from './catalog.js';

// Match complete belt references before splitting. The 4 in 4 PK 650 is a rib count;
// the 3 in 3VX 500 is part of the profile. Neither starts another item.
const core='(?:\\d{1,3}[ -]*(?:dpj|dpk|pj|pk|pl|pm|ph)[ -]*\\d{2,6}|\\d{1,2}\\s*(?:vx|v|l)[ -]*\\d{2,6}|(?:spz|spa|spb|spc|xpa|xpb|xpc|ax|bx|cx|aa|bb|cc|dpj|dpk|pj|pk|pl|pm|ph|a|b|c|d|e|z)[ -]*\\d{2,6}|(?:at|t)\\s*(?:2[.,]5|5|10|20)\\b|\\d{3,6}[ /-]+(?:s?\\d+m|[a-z]{1,3}\\d+)(?![a-z0-9]))';
const referencePattern=new RegExp(`(?<![a-z0-9])(?:(?:(?:\\d+|uma?|duas|dois|tres|quatro|cinco)\\s+)?(?:correias?|corr|cor)\\s+)?${core}(?![a-z0-9])`,'gi');
export function splitBeltRequests(query){
 const source=normalize(query),matches=[...source.matchAll(referencePattern)];
 if(matches.length<2)return[source];
 const items=matches.map((match,index)=>source.slice(index?match.index:0,matches[index+1]?.index??source.length).replace(/(?:[,;\n\s]+|\be\b)+$/g,'').trim());
 return [...new Set(items.filter(Boolean))];
}
