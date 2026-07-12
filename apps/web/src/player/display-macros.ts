export function displayMacros(content:string,user:string,char:string){return content.replace(/{{\s*user\s*}}/gi,user).replace(/{{\s*char\s*}}/gi,char);}
