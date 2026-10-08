/* NHT Accounting Ledger V4.3 - 2026-10-08 */
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
function costImpact(v){return -N(v)}
function feeParts(r){
  const p={
    transaction:costImpact(r.transaction_fee),
    commission:costImpact(r.tiktok_commission),
    processing:costImpact(r.processing_fee),
    shipping_actual:costImpact(r.shipping_actual),
    shipping_platform_discount:costImpact(r.shipping_platform_discount),
    failed_delivery_subsidy:costImpact(r.failed_delivery_subsidy),
    return_shipping_actual:costImpact(r.return_shipping_actual),
    affiliate_base:costImpact(r.affiliate_base),
    affiliate_ads:costImpact(r.affiliate_ads),
    partner_base:costImpact(r.partner_base),
    partner_ads:costImpact(r.partner_ads)
  };
  p.shipping_net=p.shipping_actual+p.shipping_platform_discount+p.failed_delivery_subsidy+p.return_shipping_actual;
  p.tiktok_invoice=p.transaction+p.commission+p.processing+p.shipping_net;
  p.creator=p.affiliate_base+p.affiliate_ads;
  p.partner=p.partner_base+p.partner_ads;
  p.total_cost=p.tiktok_invoice+p.creator+p.partner;
  return p;
}
function expectedTikTokInvoice(r){return feeParts(r).tiktok_invoice}
function platformFee(r){return feeParts(r).tiktok_invoice}
function creatorFee(r){return feeParts(r).creator}
function partnerFee(r){return feeParts(r).partner}
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
    if(!months.has(m))months.set(m,{month:m,revenue:0,transaction_fee:0,tiktok_commission:0,processing_fee:0,shipping_actual:0,shipping_platform_discount:0,failed_delivery_subsidy:0,return_shipping_actual:0,shipping_net:0,affiliate_base:0,affiliate_ads:0,partner_base:0,partner_ads:0,creator_fee:0,partner_fee:0,platform_fee:0,total_cost:0,adjustment:0,tiktok_invoice_expected:0,settlement:0,income_lines:0});
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
      const z=get(revMonth),p=feeParts(r);
      z.transaction_fee+=p.transaction;
      z.tiktok_commission+=p.commission;
      z.processing_fee+=p.processing;
      z.shipping_actual+=p.shipping_actual;
      z.shipping_platform_discount+=p.shipping_platform_discount;
      z.failed_delivery_subsidy+=p.failed_delivery_subsidy;
      z.return_shipping_actual+=p.return_shipping_actual;
      z.shipping_net+=p.shipping_net;
      z.affiliate_base+=p.affiliate_base;
      z.affiliate_ads+=p.affiliate_ads;
      z.partner_base+=p.partner_base;
      z.partner_ads+=p.partner_ads;
      z.platform_fee+=p.tiktok_invoice;
      z.creator_fee+=p.creator;
      z.partner_fee+=p.partner;
      z.total_cost+=p.total_cost;
      z.adjustment+=N(r.adjustment);
      z.tiktok_invoice_expected+=p.tiktok_invoice;
    }
    const sm=month(r.settlement_date);
    if(sm){const z=get(sm);z.settlement+=N(r.settlement);z.income_lines++;}
  }
  const arr=[...months.values()].sort((a,b)=>a.month.localeCompare(b.month));
  let closing=0;
  for(const x of arr){
    x.opening_balance=closing;
    x.net_due=x.revenue-x.total_cost+x.adjustment;
    x.closing_balance=x.opening_balance+x.net_due-x.settlement;
    closing=x.closing_balance;
  }
  return arr;
}
function journalRows(months){
  const out=[];
  for(const m of months){
    if(ABS(m.revenue)>0.000001)out.push({Thang:m.month,Nghiep_vu:'Doanh thu theo ngày hóa đơn',No:'131 - TikTok',Co:'511 / 3331',So_tien:m.revenue,Can_cu:'Hóa đơn phát hành',Dien_giai:'Ghi nhận doanh thu theo ngày HĐ'});
    const pushCost=(name,amount,account,invoiceFlag=true)=>{if(Math.abs(amount)>0.000001)out.push({Thang:m.month,Nghiep_vu:name,No:account,Co:'335 - Chi phí phải trả',So_tien:amount,Can_cu:'Income theo Order ID',Dien_giai:(invoiceFlag?'Thuộc HĐ TikTok dự kiến; ':'Không thuộc HĐ TikTok; ')+'match về tháng doanh thu'})};
    pushCost('Trích trước - Phí giao dịch',m.transaction_fee,'641/642 - Phí giao dịch');
    pushCost('Trích trước - Hoa hồng TikTok Shop',m.tiktok_commission,'641/642 - Hoa hồng sàn');
    pushCost('Trích trước - Phí xử lý đơn hàng',m.processing_fee,'641/642 - Phí xử lý');
    pushCost('Trích trước - Phí vận chuyển thực tế',m.shipping_actual,'641/642 - Phí vận chuyển');
    pushCost('Trích trước - Chiết khấu VC nền tảng',m.shipping_platform_discount,'641/642 - Phí vận chuyển');
    pushCost('Trích trước - Trợ cấp giao hàng không thành công',m.failed_delivery_subsidy,'641/642 - Phí vận chuyển');
    pushCost('Trích trước - Phí vận chuyển trả hàng',m.return_shipping_actual,'641/642 - Phí vận chuyển');
    pushCost('Trích trước - Hoa hồng liên kết',m.affiliate_base,'641/642 - Creator/Affiliate',false);
    pushCost('Trích trước - Hoa hồng liên kết quảng cáo',m.affiliate_ads,'641/642 - Creator/Affiliate',false);
    pushCost('Trích trước - Hoa hồng đối tác liên kết',m.partner_base,'641/642 - Hoa hồng đối tác',false);
    pushCost('Trích trước - Hoa hồng quảng cáo đối tác',m.partner_ads,'641/642 - Hoa hồng đối tác',false);
    if(ABS(m.adjustment)>0.000001)out.push({Thang:m.month,Nghiep_vu:'Điều chỉnh Income',No:m.adjustment>=0?'131 - TikTok':'641/642 hoặc 138/3388',Co:m.adjustment>=0?'711/3388 hoặc TK liên quan':'131 - TikTok',So_tien:Math.abs(m.adjustment),Can_cu:'Income',Dien_giai:'Khoản điều chỉnh làm thay đổi phải thu TikTok; cần rà soát bản chất trước khi chốt TK'});
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
  s('accNetDue',ACC_MONTHS.reduce((a,x)=>a+x.net_due,0));
  s('accSettlement',ACC_MONTHS.reduce((a,x)=>a+x.settlement,0));
  s('accClosing',ACC_MONTHS.length?ACC_MONTHS[ACC_MONTHS.length-1].closing_balance:0);
  if($('accContext'))$('accContext').textContent=(ctx.company||'Tất cả công ty')+' · '+(ctx.mp||'Tất cả sàn')+' · '+(ctx.year||'Tất cả năm');
  if($('accMonthlyBody'))$('accMonthlyBody').innerHTML=ACC_MONTHS.map(x=>'<tr><td>'+escA(x.month)+'</td><td>'+moneyA(x.revenue)+'</td><td>'+moneyA(x.transaction_fee)+'</td><td>'+moneyA(x.tiktok_commission)+'</td><td>'+moneyA(x.processing_fee)+'</td><td>'+moneyA(x.shipping_actual)+'</td><td>'+moneyA(x.shipping_platform_discount)+'</td><td>'+moneyA(x.failed_delivery_subsidy)+'</td><td>'+moneyA(x.return_shipping_actual)+'</td><td>'+moneyA(x.shipping_net)+'</td><td>'+moneyA(x.affiliate_base)+'</td><td>'+moneyA(x.affiliate_ads)+'</td><td>'+moneyA(x.partner_base)+'</td><td>'+moneyA(x.partner_ads)+'</td><td><b>'+moneyA(x.tiktok_invoice_expected)+'</b></td><td>'+moneyA(x.total_cost)+'</td><td>'+moneyA(x.settlement)+'</td></tr>').join('')||'<tr><td colspan="21" class="muted">Chưa có dữ liệu.</td></tr>';
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
    '<div class="kpis section" style="grid-template-columns:repeat(6,minmax(150px,1fr))"><div class="card kpi"><span class="muted">Doanh thu theo HĐ</span><b id="accRevenue">0</b></div><div class="card kpi"><span class="muted">Tổng chi phí match DT</span><b id="accCost">0</b></div><div class="card kpi"><span class="muted">HĐ TikTok dự kiến</span><b id="accTikTokInv">0</b></div><div class="card kpi"><span class="muted">Phải thu phát sinh</span><b id="accNetDue">0</b></div><div class="card kpi"><span class="muted">TikTok đã quyết toán</span><b id="accSettlement">0</b></div><div class="card kpi"><span class="muted">Dư cuối kỳ</span><b id="accClosing">0</b></div></div>',
    '<div class="card section"><h3>Tổng hợp chi phí chi tiết theo tháng</h3><div class="note" style="margin-bottom:10px"><b>HĐ TikTok dự kiến</b> = các phí TikTok chi tiết, không gồm Creator/Affiliate và hoa hồng đối tác. <b>Phải thu phát sinh trong tháng = Doanh thu theo HĐ - Tổng chi phí match doanh thu + Điều chỉnh Income.</b> <b>Dư cuối kỳ = Dư đầu kỳ + Phải thu phát sinh - Tiền TikTok đã quyết toán.</b> Dư cuối kỳ tự chuyển sang dư đầu kỳ tháng sau.</div><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Doanh thu theo HĐ</th><th>Phí giao dịch</th><th>HH TikTok</th><th>Phí xử lý</th><th>VC thực tế</th><th>CK VC nền tảng</th><th>Trợ cấp giao thất bại</th><th>VC trả hàng</th><th>VC thuần</th><th>Affiliate</th><th>Affiliate Ads</th><th>HH đối tác</th><th>HH QC đối tác</th><th>Tổng chi phí</th><th>Điều chỉnh Income</th><th>HĐ TikTok dự kiến</th><th>Dư đầu kỳ</th><th>Phải thu phát sinh = DT - CP + ĐC</th><th>TikTok đã quyết toán</th><th>Dư cuối kỳ</th></tr></thead><tbody id="accMonthlyBody"></tbody></table></div></div>',
    '<div class="card section"><h3>Bút toán gợi ý</h3><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Nghiệp vụ</th><th>Nợ</th><th>Có</th><th>Số tiền</th><th>Căn cứ</th><th>Diễn giải</th></tr></thead><tbody id="accJournalBody"></tbody></table></div><div class="note" style="margin-top:10px">Khi nhận HĐ TikTok thực tế: đối chiếu số HĐ với <b>HĐ TikTok dự kiến</b>, hoàn/đảo khoản trích trước 335 tương ứng và chỉ ghi nhận VAT đầu vào 1331 theo HĐ hợp lệ.</div></div>'
  ].join('');
  if($('accCompany'))$('accCompany').value=$('companyName')?.value||'';
  if($('accYear'))$('accYear').value=$('dataYear')?.value||new Date().getFullYear();
  if($('accMarketplace'))$('accMarketplace').value=$('marketplaceSelect')?.value||'tiktok';
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(install,850));
document.addEventListener('click',e=>{const b=e.target.closest?.('.navbtn');if(b?.dataset?.page==='accounting')setTimeout(()=>renderAccounting().catch(console.error),120)});
})();