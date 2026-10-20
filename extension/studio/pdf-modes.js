// Tool tabs for the PDF tools page: merge, split and organize share one card column.
const $=id=>document.getElementById(id);
const tabs=[['mode-merge','merge-mode',true],['mode-split','split-mode',false],['mode-organize','organize-mode',false]];
function apply(){
 let preview=false;
 for(const [button,panel,hasPreview] of tabs){
  const on=$(button).getAttribute('aria-pressed')==='true';
  $(panel).hidden=!on;
  if(on&&hasPreview)preview=true;
 }
 $('preview-card').hidden=!preview;
}
for(const [button] of tabs)$(button).onclick=()=>{
 for(const [other] of tabs)$(other).setAttribute('aria-pressed',String(other===button));
 apply();
};
apply();
