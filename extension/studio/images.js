export const imageLimits={count:30,bytes:60*1024*1024,pixels:80000000,perImagePixels:24000000};
export async function inspectImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose JPG, PNG or WebP images.');
  if(file.size>12*1024*1024)throw Error('Each image must be smaller than 12 MB.');
  const bitmap=await createImageBitmap(file);
  const result={width:bitmap.width,height:bitmap.height};bitmap.close();
  if(result.width*result.height>imageLimits.perImagePixels)throw Error('Each image must have at most 24 megapixels.');
  return result;
}
export async function imagesToPdf(items,options,settings={},signal,onProgress=()=>{}){
  if(!items.length)throw Error('Choose at least one image.');
  if(items.length>imageLimits.count||items.reduce((n,i)=>n+i.width*i.height,0)>imageLimits.pixels)throw Error('Image budget exceeded (30 images / 80 megapixels).');
  const pdf=await PDFLib.PDFDocument.create(),warnings=[];
  const mm=72/25.4,quality={small:.6,standard:.82,clear:.95}[settings.quality||'standard'];
  for(let index=0;index<items.length;index++){
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    const item=items[index],bitmap=await createImageBitmap(item.file),rotation=item.rotation||0;
    let iw=bitmap.width,ih=bitmap.height;if(rotation%180)[iw,ih]=[ih,iw];
    let [w,h]=ConversionOptions.dimensions(options);
    if(settings.autoOrientation && ((iw>ih)!==(w>h)))[w,h]=[h,w];
    const availableW=w-options.marginsMm.left-options.marginsMm.right,availableH=h-options.marginsMm.top-options.marginsMm.bottom;
    if(availableW<=0||availableH<=0){bitmap.close();throw Error('Margins leave no printable image space.');}
    const scale=settings.fit==='original'?25.4/96:settings.fit==='fill'?Math.max(availableW/iw,availableH/ih):Math.min(availableW/iw,availableH/ih);
    if(settings.fit==='original'&&(iw*scale>availableW||ih*scale>availableH)){bitmap.close();throw Error('An image at original size does not fit this paper. Choose Fit or larger paper.');}
    const dpi=iw/(Math.min(iw*scale,availableW)/25.4);if(dpi<120)warnings.push(`${item.file.name}: resolution is below 120 dpi at this paper size.`);
    const maxSide={small:1400,standard:2400,clear:4000}[settings.quality||'standard'];const shrink=Math.min(1,maxSide/Math.max(iw,ih));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(iw*shrink));canvas.height=Math.max(1,Math.round(ih*shrink));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(bitmap,-bitmap.width*shrink/2,-bitmap.height*shrink/2,bitmap.width*shrink,bitmap.height*shrink);bitmap.close();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)throw Error('This image could not be decoded.');
    const image=await pdf.embedJpg(await blob.arrayBuffer());canvas.width=canvas.height=1;
    const page=pdf.addPage([w*mm,h*mm]);
    const drawW=iw*scale*mm,drawH=ih*scale*mm,x=(options.marginsMm.left+(availableW-iw*scale)/2)*mm,y=(options.marginsMm.bottom+(availableH-ih*scale)/2)*mm;
    page.pushOperators(PDFLib.pushGraphicsState(),PDFLib.rectangle(options.marginsMm.left*mm,options.marginsMm.bottom*mm,availableW*mm,availableH*mm),PDFLib.clip(),PDFLib.endPath());
    page.drawImage(image,{x,y,width:drawW,height:drawH});page.pushOperators(PDFLib.popGraphicsState());
    onProgress(index+1,items.length);await new Promise(resolve=>setTimeout(resolve,0));
  }
  let result=pdf;
  if(options.pageRanges){result=await PDFLib.PDFDocument.create();const pages=await result.copyPages(pdf,ConversionOptions.rangeIndices(options.pageRanges,pdf.getPageCount()));pages.forEach(page=>result.addPage(page));}
  return {blob:new Blob([await result.save()],{type:'application/pdf'}),pages:result.getPageCount(),warnings};
}
