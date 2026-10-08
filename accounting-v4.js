/* NHT Accounting Ledger V4.6 - 2026-10-08 */
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
  for(const x of arr){
    x.calculated_settlement=x.revenue-x.total_cost+x.adjustment;
    x.settlement_variance=x.settlement-x.calculated_settlement;
  }
  return arr;
}
function journalRows(months){
  const out=[];
  const push=(m,type,no,co,amt,basis,note)=>{
    if(Math.abs(N(amt))<=0.000001)return;
    out.push({Thang:m.month,Nghiep_vu:type,No:no,Co:co,So_tien:Math.abs(N(amt)),Can_cu:basis,Dien_giai:note});
  };
  const postAgainst138=(m,name,amount,expenseAccount,belongsTikTokInvoice=true)=>{
    const a=N(amount);
    if(Math.abs(a)<=0.000001)return;
    if(a>0){
      // Chi phí làm giảm số phải thu TikTok.
      push(m,'Khấu trừ trên 138 - '+name,expenseAccount,'1388 - TikTok',a,'Income theo Order ID',(belongsTikTokInvoice?'Thuộc HĐ TikTok dự kiến; ':'Không thuộc HĐ TikTok; ')+'giảm số dư phải thu TikTok');
    }else{
      // Chiết khấu/trợ cấp làm tăng số phải thu TikTok.
      push(m,'Hoàn/giảm phí trên 138 - '+name,'1388 - TikTok',expenseAccount,-a,'Income theo Order ID','Khoản giảm/trợ cấp làm tăng số dư phải thu TikTok');
    }
  };

  for(const m of months){
    // Đây là bút toán kiểm soát công nợ sàn, KHÔNG phải bút toán ghi nhận doanh thu.
    push(m,'Kết chuyển doanh thu sang công nợ TikTok','1388 - TikTok','131 - Phải thu khách hàng',m.revenue,'Hóa đơn phát hành','Chuyển giá trị HĐ đã ghi nhận doanh thu sang tài khoản theo dõi phải thu TikTok');

    postAgainst138(m,'Phí giao dịch',m.transaction_fee,'641/642 - Phí giao dịch',true);
    postAgainst138(m,'Hoa hồng TikTok Shop',m.tiktok_commission,'641/642 - Hoa hồng sàn',true);
    postAgainst138(m,'Phí xử lý đơn hàng',m.processing_fee,'641/642 - Phí xử lý',true);
    postAgainst138(m,'Phí vận chuyển thực tế',m.shipping_actual,'641/642 - Phí vận chuyển',true);
    postAgainst138(m,'Chiết khấu phí vận chuyển nền tảng',m.shipping_platform_discount,'641/642 - Phí vận chuyển',true);
    postAgainst138(m,'Trợ cấp giao hàng không thành công',m.failed_delivery_subsidy,'641/642 - Phí vận chuyển',true);
    postAgainst138(m,'Phí vận chuyển trả hàng thực tế',m.return_shipping_actual,'641/642 - Phí vận chuyển',true);
    postAgainst138(m,'Hoa hồng liên kết',m.affiliate_base,'641/642 - Creator/Affiliate',false);
    postAgainst138(m,'Hoa hồng liên kết quảng cáo',m.affiliate_ads,'641/642 - Creator/Affiliate',false);
    postAgainst138(m,'Hoa hồng đối tác liên kết',m.partner_base,'641/642 - Hoa hồng đối tác',false);
    postAgainst138(m,'Hoa hồng quảng cáo đối tác',m.partner_ads,'641/642 - Hoa hồng đối tác',false);

    if(Math.abs(N(m.adjustment))>0.000001){
      if(N(m.adjustment)>0){
        push(m,'Điều chỉnh tăng phải thu TikTok','1388 - TikTok','3388 - Chờ phân loại',m.adjustment,'Income','Điều chỉnh dương làm tăng số dư 138 TikTok; chờ phân loại bản chất');
      }else{
        push(m,'Điều chỉnh giảm phải thu TikTok','1388 - Chờ phân loại','1388 - TikTok',-m.adjustment,'Income','Điều chỉnh âm làm giảm số dư 138 TikTok; chờ phân loại bản chất');
      }
    }

    // Không hạch toán N112/C138 trong bảng kiểm này.
    // Mục tiêu: số dư 138 sau doanh thu - phí +/- điều chỉnh phải bằng settlement Income.
    push(m,'Đối chiếu settlement Income','—','—',m.settlement,'Tổng settlement file Income','CHỈ ĐỐI CHIẾU: số dư 138 TikTok tính được phải bằng settlement của sàn; không phải bút toán ghi sổ');
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
  s('accCalculatedSettlement',ACC_MONTHS.reduce((a,x)=>a+x.calculated_settlement,0));
  s('accSettlement',ACC_MONTHS.reduce((a,x)=>a+x.settlement,0));
  s('accSettlementVariance',ACC_MONTHS.reduce((a,x)=>a+x.settlement_variance,0));
  if($('accContext'))$('accContext').textContent=(ctx.company||'Tất cả công ty')+' · '+(ctx.mp||'Tất cả sàn')+' · '+(ctx.year||'Tất cả năm');
  if($('accMonthlyBody'))$('accMonthlyBody').innerHTML=ACC_MONTHS.map(x=>
    '<tr>'+
    '<td>'+escA(x.month)+'</td>'+
    '<td>'+moneyA(x.revenue)+'</td>'+
    '<td>'+moneyA(x.transaction_fee)+'</td>'+
    '<td>'+moneyA(x.tiktok_commission)+'</td>'+
    '<td>'+moneyA(x.processing_fee)+'</td>'+
    '<td>'+moneyA(x.shipping_actual)+'</td>'+
    '<td>'+moneyA(x.shipping_platform_discount)+'</td>'+
    '<td>'+moneyA(x.failed_delivery_subsidy)+'</td>'+
    '<td>'+moneyA(x.return_shipping_actual)+'</td>'+
    '<td>'+moneyA(x.shipping_net)+'</td>'+
    '<td>'+moneyA(x.affiliate_base)+'</td>'+
    '<td>'+moneyA(x.affiliate_ads)+'</td>'+
    '<td>'+moneyA(x.partner_base)+'</td>'+
    '<td>'+moneyA(x.partner_ads)+'</td>'+
    '<td>'+moneyA(x.total_cost)+'</td>'+
    '<td>'+moneyA(x.adjustment)+'</td>'+
    '<td><b>'+moneyA(x.tiktok_invoice_expected)+'</b></td>'+
    '<td><b>'+moneyA(x.calculated_settlement)+'</b></td>'+
    '<td>'+moneyA(x.settlement)+'</td>'+
    '<td>'+moneyA(x.settlement_variance)+'</td>'+
    '</tr>'
  ).join('')||'<tr><td colspan="20" class="muted">Chưa có dữ liệu.</td></tr>';
  if($('accJournalBody'))$('accJournalBody').innerHTML=ACC_JOURNAL.map(x=>'<tr><td>'+escA(x.Thang)+'</td><td>'+escA(x.Nghiep_vu)+'</td><td>'+escA(x.No)+'</td><td>'+escA(x.Co)+'</td><td>'+moneyA(x.So_tien)+'</td><td>'+escA(x.Can_cu)+'</td><td>'+escA(x.Dien_giai)+'</td></tr>').join('')||'<tr><td colspan="7" class="muted">Chưa có bút toán.</td></tr>';
}
window.renderAccountingV4=renderAccounting;
window.exportAccountingV4=()=>objectRowsToXlsx(ACC_MONTHS,'HACH_TOAN_TONG_HOP_THEO_THANG.xlsx','Tong hop thang',true);
window.exportJournalV4=()=>objectRowsToXlsx(ACC_JOURNAL,'BUT_TOAN_GOI_Y.xlsx','But toan',true);
function install(){
  const sec=$('accounting');if(!sec)return;
  sec.innerHTML=[
    '<div class="card section"><h2>Phân hệ kiểm soát TK 138 TikTok</h2><div class="muted">Phần này <b>không ghi nhận doanh thu</b>; doanh thu đã được hạch toán ở phân hệ khác. Mục tiêu là kiểm tra <b>số dư phải thu 138 TikTok</b>: chuyển giá trị hóa đơn sang 138, trừ từng khoản phí/hoa hồng, cộng/trừ điều chỉnh, sau đó đối chiếu với <b>settlement trong Income</b>.</div></div>',
    '<div class="card section"><div class="grid3"><div><label class="muted">Công ty</label><input id="accCompany"></div><div><label class="muted">Năm</label><input id="accYear" type="number"></div><div><label class="muted">Sàn</label><select id="accMarketplace"><option value="tiktok">TikTok</option><option value="shopee">Shopee</option><option value="custom">Khác</option></select></div></div><div style="margin-top:10px"><button class="btn primary" onclick="renderAccountingV4()">Tính lại</button> <button class="btn" onclick="exportAccountingV4()">Xuất tổng hợp tháng</button> <button class="btn" onclick="exportJournalV4()">Xuất bút toán</button> <span id="accContext" class="muted"></span></div></div>',
    '<div class="kpis section" style="grid-template-columns:repeat(6,minmax(150px,1fr))"><div class="card kpi"><span class="muted">Doanh thu theo HĐ</span><b id="accRevenue">0</b></div><div class="card kpi"><span class="muted">Tổng chi phí match DT</span><b id="accCost">0</b></div><div class="card kpi"><span class="muted">HĐ TikTok dự kiến</span><b id="accTikTokInv">0</b></div><div class="card kpi"><span class="muted">Số dư 138 TikTok tính</span><b id="accCalculatedSettlement">0</b></div><div class="card kpi"><span class="muted">Settlement Income</span><b id="accSettlement">0</b></div><div class="card kpi"><span class="muted">Chênh 138 - Settlement</span><b id="accSettlementVariance">0</b></div></div>',
    '<div class="card section"><h3>Tổng hợp chi phí chi tiết theo tháng</h3><div class="note" style="margin-bottom:10px"><b>HĐ TikTok dự kiến</b> = Phí giao dịch + HH TikTok + Phí xử lý + vận chuyển thuần; không gồm Creator/Affiliate và hoa hồng đối tác. <b>Số dư 138 TikTok tính = Doanh thu theo HĐ - Tổng chi phí + Số tiền điều chỉnh TikTok.</b> <b>Settlement Income</b> = số sàn quyết toán. <b>Chênh = Settlement Income - Số dư 138 tính.</b></div><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Doanh thu theo HĐ</th><th>Phí giao dịch</th><th>HH TikTok</th><th>Phí xử lý</th><th>VC thực tế</th><th>CK VC nền tảng</th><th>Trợ cấp giao thất bại</th><th>VC trả hàng</th><th>VC thuần</th><th>Affiliate</th><th>Affiliate Ads</th><th>HH đối tác</th><th>HH QC đối tác</th><th>Tổng chi phí</th><th>Số tiền điều chỉnh TikTok</th><th>HĐ TikTok dự kiến</th><th>Số dư 138 TikTok tính</th><th>Settlement Income</th><th>Chênh 138 - Settlement</th></tr></thead><tbody id="accMonthlyBody"></tbody></table></div></div>',
    '<div class="card section"><h3>Bảng kiểm luân chuyển TK 138 TikTok</h3><div class="tablewrap"><table><thead><tr><th>Tháng</th><th>Nghiệp vụ</th><th>Nợ</th><th>Có</th><th>Số tiền</th><th>Căn cứ</th><th>Diễn giải</th></tr></thead><tbody id="accJournalBody"></tbody></table></div><div class="note" style="margin-top:10px">Đây là <b>bảng kiểm công nợ 138 TikTok</b>, không thay thế bút toán doanh thu. Trước khi ghi sổ chính thức cần đối chiếu hóa đơn phí thực tế, VAT đầu vào và bản chất từng khoản điều chỉnh.</div></div>'
  ].join('');
  if($('accCompany'))$('accCompany').value=$('companyName')?.value||'';
  if($('accYear'))$('accYear').value=$('dataYear')?.value||new Date().getFullYear();
  if($('accMarketplace'))$('accMarketplace').value=$('marketplaceSelect')?.value||'tiktok';
}
document.addEventListener('DOMContentLoaded',()=>setTimeout(install,850));
document.addEventListener('click',e=>{const b=e.target.closest?.('.navbtn');if(b?.dataset?.page==='accounting')setTimeout(()=>renderAccounting().catch(console.error),120)});
})();