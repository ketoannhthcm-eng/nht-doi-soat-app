/* NHT Accounting Ledger V4 - 2026-10-08 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const N=v=>Number(v||0)||0;
const T=v=>String(v??'').trim();
const ABS=v=>Math.abs(N(v));
function moneyA(v){return typeof money==='function'?money(v):N(v).toLocaleString('vi-VN',{maximumFractionDigits:0})}
function escA(v){return typeof escapeHtml==='function'?escapeHtml(v):T(v)}
function dkey(v){
  const s=T(v); if(!s)return '';
  let m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  return '';
}
function month(v){const d=dkey(v);return d?d.slice(0,7):''}
function invKey(it){return [T(it.no),T(it.date),T(it.status),N(it.amount)].join('|')}
function incomeKey(r){
  return [T(r.order_id),T(r.settlement_date),N(r.seller_net),N(r.buyer_shipping_net),N(r.transaction_fee),N(r.tiktok_commission),N(r.processing_fee),N(r.shipping_net),N(r.affiliate),N(r.partner),N(r.adjustment),N(r.settlement)].join('|');
}
function expectedTikTokInvoice(r){
  const total=N(r.total_fee_source);
  // HĐ TikTok dự kiến = Tổng phí Income - Creator/Affiliate - Hoa hồng đối tác.
  // Dữ liệu phí Income thường âm, trả ra số chi phí dương.
  if(ABS(total)>0.000001) return Math.abs(total - N(r.affiliate) - N(r.partner));
  return Math.abs(N(r.transaction_fee)+N(r.tiktok_commission)+N(r.processing_fee)+N(r.shipping_net));
}
function platformFee(r){return expectedTikTokInvoice(r)}
function creatorFee(r){return Math.abs(N(r.affiliate))}
function partnerFee(r){return Math.abs(N(r.partner))}
function chooseOrder(a,b){
  if(!a)return b;
  const score=x=>(x.delivered?4:0)+(x.created?2:0)+(x.order_status?1:0)+(ABS(x.order_amount)>0?3:0);
  return score(b)>=score(a)?b:a;
}
function revenueMonthForOrder(orderId,invoiceItems,order){
  const dates=(invoiceItems||[]).filter(x=>{
    const s=T(x.status);
    return x.date && (s==='HĐ mới'||s==='HĐ đã bị điều chỉnh'||s==='HĐ thay thế'||!s);
  }).map(x=>dkey(x.date)).filter(Boolean).sort();
  if(dates.length)return dates[0].slice(0,7);
  return month(order?.delivered||order?.created||'');
}
async function accountingContext(){
  const all=await dbGetAllPeriods();
  const company=T($('accCompany')?.value||$('companyName')?.value);
  const year=Number($('accYear')?.value||$('dataYear')?.value||0);
  const mp=T($('accMarketplace')?.value||$('marketplaceSelect')?.value||'tiktok');
  return {company,year,mp,periods:all.filter(p=>(!company||p.company===company)&&(!year||Number(p.year)===year)&&(!mp||p.marketplace===mp))};
}
function buildLedger(periods){
  const orderMap=new Map(), invoicesByOrder=new Map(), seenInv=new Set(), incomeEvents=[], seenIncome=new Set();
  for(const p of periods){
    for(const r of (p.rows||[])){
      const id=T(r.order_id); if(!id)continue;
      if(r.order_status||r.created||r.delivered||r.order_source_present) orderMap.set(id,chooseOrder(orderMap.get(id),r));
      for(const it of (r.invoice_items||[])){
        const k=invKey(it); if(seenInv.has(k))continue; seenInv.add(k);
        if(!invoicesByOrder.has(id))invoicesByOrder.set(id,[]);
        invoicesByOrder.get(id).push({...it,order_id:id});
      }
      const hasIncome=r.income_source_present||ABS(r.settlement)>0.000001||ABS(r.total_fee_source)>0.000001||
        ABS(r.transaction_fee)+ABS(r.tiktok_commission)+ABS(r.processing_fee)+ABS(r.shipping_net)+ABS(r.affiliate)+ABS(r.partner)>0.000001;
      if(hasIncome){
        const k=incomeKey(r); if(!seenIncome.has(k)){seenIncome.add(k);incomeEvents.push({...r,_period:p.period});}
      }
    }
  }
  const months=new Map();
  const get=m=>{
    if(!months.has(m))months.set(m,{month:m,revenue:0,platform_fee:0,creator_fee:0,partner_fee:0,total_cost:0,tiktok_invoice_expected:0,settlement:0,income_lines:0});
    return months.get(m);
  };
  // Doanh thu: theo ngày HĐ.
  for(const items of invoicesByOrder.values()){
    for(const it of items){
      const m=month(it.date); if(!m)continue;
      if(T(it.status)==='HĐ đã bị thay thế')continue;
      get(m).revenue+=N(it.amount);
    }
  }
  // Chi phí match với tháng doanh thu; settlement theo tháng quyết toán.
  for(const r of incomeEvents){
    const id=T(r.order_id), revMonth=revenueMonthForOrder(id,invoicesByOrder.get(id)||[],orderMap.get(id))||month(r.created)||month(r.settlement_date);
    if(revMonth){
      const z=get(revMonth),pf=platformFee(r),cf=creatorFee(r),pt=partnerFee(r);
      z.platform_fee+=pf;z.creator_fee+=cf;z.partner_fee+=pt;z.total_cost+=pf+cf+pt;z.tiktok_invoice_expected+=pf;
    }
    const sm=month(r.settlement_date);
    if(sm){const z=get(sm);z.settlement+=N(r.settlement);z.income_lines++;}
  }
  return [...months.values()].sort((a,b)=>a.month.localeCompare(b.month));
}
function journalRows(months){
  const out=[];
  for(const m of months){
    if(ABS(m.revenue)>0.000001)out.push({Thang:m.month,Nghiep_vu:'Doanh thu theo ngày hóa đơn',No:'131 - TikTok',Co:'511 / 3331',So_tien:m.revenue,Can_cu:'Hóa đơn phát hành',Dien_giai:'Ghi nhận doanh thu theo ngày HĐ'});
    if(m.platform_fee>0.000001)out.push({Thang:m.month,Nghiep_vu:'Trích trước phí TikTok',No:'641/642 - Phí sàn',Co:'335 - Chi phí phải trả',So_tien:m.platform_fee,Can_cu:'Income theo Order ID',Dien_giai:'Match chi phí TikTok về tháng doanh thu; chờ HĐ TikTok'});
    if(m.creator_fee>0.000001)out.push({Thang:m.month,Nghiep_vu:'Trích trước Creator/Affiliate',No:'641/642 - Creator/Affiliate',Co:'335/3388',So_tien:m.creator_fee,Can_cu:'Income',Dien_giai:'Tách riêng, không nằm trong HĐ TikTok'});
    if(m.partner_fee>0.000001)out.push({Thang:m.month,Nghiep_vu:'Trích trước hoa hồng đối tác',No:'641/642 - Hoa hồng đối tác',Co:'335/3388',So_tien:m.partner_fee,Can_cu:'Income',Dien_giai:'Tách riêng, không nằm trong HĐ TikTok'});
    if(ABS(m.settlement)>0.000001)out.push({Thang:m.month,Nghiep_vu:'TikTok quyết toán',No:'112',Co:'131 - TikTok',So_tien:m.settlement,Can_cu:'Tổng settlement file Income',Dien_giai:'Tiền quyết toán = tổng settlement các file Income'});
  }
  return out;
}
let ACC_MONTHS=[],ACC_JOURNAL=[];
async function renderAccounting(){
  const ctx=await accountingContext();
  ACC_MONTHS=buildLedger(ctx.periods); ACC_JOURNAL=journalRows(ACC_MONTHS);
  const s=(id,v)=>{if($(id))$(id).textContent=moneyA(v)};
  s('accRevenue',ACC_MONTHS.reduce((a,x)=>a+x.revenue,0));
  s('accCost',ACC_MONTHS.reduce((a,x)=>a+x.total_cost,0));
  s('accTikTokInv',ACC_MONTHS.reduce((a,x)=>a+x.tiktok_invoice_expected,0));
  s('accSettlement',ACC_MONTHS.reduce((a,x)=>a+x.settlement,0));
  if($('accContext'))$('accContext').textContent=(ctx.company||'Tất cả công ty')+' · '+(ctx.mp||'Tất cả sàn')+' · '+(ctx.year||'Tất cả năm');
  if($('accMonthlyBody'))$('accMonthlyBody').innerHTML=ACC_MONTHS.map(x=>'<tr><td>'+escA(x.month)+'</td><td>'+moneyA(x.revenue)+'</td><td>'+moneyA(x.platform_fee)+'</td><td>'+moneyA(x.creator_fee)+'</td><td>'+moneyA(x.partner_fee)+'</td><td>'+moneyA(x.total_cost)+'</td><td><b>'+moneyA(x.tiktok_invoice_expected)+'</b></td><td>'+moneyA(x.settlement)+'</td></tr>').join('')||'<tr><td colspan="8" class="muted">Chưa có dữ liệu.</td></tr>';
  if($('accJournalBody'))$('accJournalBody').innerHTML=ACC_JOURNAL.map(x=>'<tr><td>'+escA(x.Thang)+'</td><td>'+escA(x.Nghiep_vu)+'</td><td>'+escA(x.No)+'</td><td>'+escA(x.Co)+'</td><td>'+moneyA(x.So_tien)+'</td><td>'+escA(x.Can_cu)+'</td><td>'+escA(x.Dien_giai)+'</td></tr>').join('')||'<tr><td colspan="7" class="muted">Chưa có bút toán.</td></tr>';
}
window.renderAccountingV4=renderAccounting;
window.exportAccountingV4=()=>objectRowsToXlsx(ACC_MONTHS,'HACH_TOAN_TONG_HOP_THEO_THANG.xlsx','Tong hop thang',true);
window.exportJournalV4=()=>objectRowsToXlsx(ACC_JOURNAL,'BUT_TOAN_GOI_Y.xlsx','But toan',true);
function install(){
  const sec=$('accounting');if(!sec)return;
  sec.innerHTML=[
    '<div class="card section"><h2>Phân hệ hạch toán / sổ sách</h2><div class="muted"><b>Doanh thu:</b> theo ngày HĐ. <b>Chi phí:</b> match về tháng doanh thu của Order ID; nếu tháng sau mới quyết toán vẫn trích trước tại tháng doanh thu. <b>Tiền quyết toán:</b> đúng bằng tổng settlement của các file Income.</div></div>',
    '<div class="card section"><div class="grid3"><div><label class="muted">Công ty</label><input id="accCompany"></div><div><label class="muted">Năm</label><input id="accYear" type="number"></div><div><label class="muted">Sàn</label><select id="accMarketplace"><option value="tiktok">TikTok</option><option value="shopee">Shopee</option><option value="custom">Khác</option></select></div></div><div style="margin-top:10px"><button class="btn primary" onclick="renderAccountingV4()">Tính lại</button> <button class="btn" onclick="exportAccountingV4()">Xuất tổng hợp tháng</button> <button class="btn" onclick="exportJournalV4()">Xuất bút toán</button> <span id="accContext" class="muted"></span></div></div>',
    '<div class="kpis section" style="grid-template-columns:repeat(4,minmax(160px,1fr))"><div class="card kpi"><span class="muted">Doanh thu theo HĐ</span><b id="accRevenue">0</b></div><div class="card kpi"><span class="muted">Tổng chi phí match DT</span><b id="accCost">0</b></div><div class="card kpi"><span class="muted">HĐ TikTok dự kiến</span><b id="accTikTokInv">0</b></div><div class="card kpi"><span class="muted">Tiền quyết toán Income</span><b id="accSettlement">0</b></div></div>',
    '<div class="card section"><h3>Tổng hợp theo tháng</h3><div class="note" style="margin-bottom:10px"><b>HĐ TikTok dự kiến = Tổng phí Income - Creator/Affiliate - Hoa hồng đối tác.</b> Phần Creator/Affiliate và đối tác theo dõi riêng, không đưa vào HĐ TikTok.</div><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Doanh thu theo HĐ</th><th>Phí TikTok trích trước</th><th>Creator/Affiliate</th><th>HH đối tác</th><th>Tổng chi phí</th><th>HĐ TikTok dự kiến</th><th>Tiền quyết toán</th></tr></thead><tbody id="accMonthlyBody"></tbody></table></div></div>',
    '<div class="card section"><h3>Bút toán gợi ý</h3><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Nghiệp vụ</th><th>Nợ</th><th>Có</th><th>Số tiền</th><th>Căn cứ</th><th>Diễn giải</th></tr></thead><tbody id="accJournalBody"></tbody></table></div><div class="note" style="margin-top:10px">Khi nhận HĐ TikTok thực tế: đối chiếu số HĐ với <b>HĐ TikTok dự kiến</b>, hoàn/đảo khoản trích trước 335 tương ứng và chỉ ghi nhận VAT đầu vào 1331 theo HĐ hợp lệ.</div></div>'
  ].join('');
  if($('accCompany'))$('accCompany').value=$('companyName')?.value||'';
  if($('accYear'))$('accYear').value=$('dataYear')?.value||new Date().getFullYear();
  if($('accMarketplace'))$('accMarketplace').value=$('marketplaceSelect')?.value||'tiktok';
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(install,850));
document.addEventListener('click',e=>{const b=e.target.closest?.('.navbtn');if(b?.dataset?.page==='accounting')setTimeout(()=>renderAccounting().catch(console.error),120)});
})();