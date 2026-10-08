/* NHT Accounting Reconciliation V3.14 - 2026-10-08 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const n=v=>Number(v||0)||0;
const t=v=>String(v??'').trim();
const tol=()=>typeof invoiceTolerance==='function'?invoiceTolerance():1;
const abs=v=>Math.abs(n(v));
function dateKey(v){const s=t(v);if(!s)return '';let m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);if(m)return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');m=s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);if(m)return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');return ''}
function ym(v){const d=dateKey(v);return d?d.slice(0,7):''}
function inPeriod(v){let meta={};try{meta=currentPeriodMeta()||{}}catch(e){};const d=dateKey(v);if(!d)return false;if(meta.from&&d<meta.from)return false;if(meta.to&&d>meta.to)return false;return true}
function delivered(r){const s=t(r.order_status).toLowerCase();return !!r.delivered||s.includes('đã giao')||s.includes('hoàn tất')||s.includes('delivered')||s.includes('completed')||s.includes('đã vận chuyển')}
function moneyV(v){return typeof money==='function'?money(v):n(v).toLocaleString('vi-VN',{maximumFractionDigits:0})}
function esc(v){return typeof escapeHtml==='function'?escapeHtml(v):t(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function sum(a,k){return a.reduce((s,r)=>s+n(r[k]),0)}
function maxAbs(a,b){return abs(b)>abs(a)?n(b):n(a)}

function deriveRevenue(r){
  let orderOriginal=n(r.order_amount);
  if(abs(orderOriginal)<=tol()) orderOriginal=n(r.sku_revenue)+n(r.order_shipping_buyer);
  if(abs(orderOriginal)<=tol() && r.order_source_present && !r.income_source_present && abs(r.required_invoice)>tol()) orderOriginal=n(r.required_invoice);
  const orderRefund=abs(n(r.order_refund_amount));
  const orderCurrent=orderOriginal-orderRefund;

  // Income reflects TikTok's actual settlement revenue structure:
  // seller subtotal after discount + seller refund + buyer shipping + buyer shipping refund.
  const incomeOriginal=n(r.seller_revenue)+n(r.buyer_shipping_income);
  const incomeRefundDelta=n(r.seller_refund)+n(r.buyer_shipping_refund);
  const incomeCurrent=incomeOriginal+incomeRefundDelta;
  const useIncome=!!r.income_source_present && (abs(incomeOriginal)>tol() || abs(incomeCurrent)>tol());

  const original=useIncome?incomeOriginal:orderOriginal;
  const refund=useIncome?Math.abs(incomeRefundDelta):orderRefund;
  const current=useIncome?incomeCurrent:orderCurrent;
  const source=useIncome?'INCOME':'ORDERS';

  const first=n(r.invoice_original_issued_amount||r.invoice_new_amount);
  const actualAdj=n(r.invoice_adjustment_amount);
  const effective=n(r.invoice_effective_amount||r.invoice_active_net||r.invoice_amount_all);
  const expectedAdj=(n(r.invoice_count)>0)?current-first:0;
  return {
    original,refund,current,source,
    orderOriginal,orderRefund,orderCurrent,
    incomeOriginal,incomeRefundDelta,incomeCurrent,
    first,expectedAdj,actualAdj,effective,
    firstDiff:first-original,currentDiff:effective-current
  };
}
function incomeRevenue(r){return n(r.seller_revenue)+n(r.seller_refund)+n(r.buyer_shipping_income)+n(r.buyer_shipping_refund)}
function feeDetailTotal(r){
  return n(r.transaction_fee)+n(r.tiktok_commission)+n(r.processing_fee)+
    n(r.shipping_actual)+n(r.shipping_platform_discount)+n(r.failed_delivery_subsidy)+n(r.return_shipping_actual)+
    n(r.affiliate_base)+n(r.affiliate_ads)+n(r.partner_base)+n(r.partner_ads)
}
function sourceFeeTotal(r){
  const src=n(r.total_fee_source),mapped=feeDetailTotal(r);
  return abs(src)>tol()?src:mapped;
}
function sourceState(r){if(r.order_source_present&&r.income_source_present)return 'Đơn hàng + Income';if(r.order_source_present)return 'Chỉ Đơn hàng';if(r.income_source_present)return 'Chỉ Income';return 'Không rõ'}

function invoiceState(r,d){
  const T=tol();
  if(!r.order_source_present)return 'CHỜ ĐƠN GỐC';
  if(!delivered(r))return 'CHƯA ĐẾN THỜI ĐIỂM XUẤT HĐ';
  if(n(r.invoice_count)===0)return abs(d.original)>T?'CHƯA XUẤT HĐ':'KHÔNG PHÁT SINH';
  if(abs(d.firstDiff)>T)return d.firstDiff>0?'DƯ HĐ LẦN ĐẦU':'THIẾU HĐ LẦN ĐẦU';
  if(abs(d.refund)>T){
    if(abs(d.actualAdj)<=T)return 'CẦN ĐIỀU CHỈNH';
    if(abs(d.actualAdj-d.expectedAdj)>T)return 'ĐIỀU CHỈNH CHƯA KHỚP';
  }
  if(abs(d.currentDiff)>T)return d.currentDiff>0?'DƯ HĐ SAU ĐIỀU CHỈNH':'THIẾU HĐ SAU ĐIỀU CHỈNH';
  if(abs(d.actualAdj)>T||abs(n(r.invoice_replacement_amount))>T)return 'ĐÃ ĐIỀU CHỈNH - KHỚP';
  return 'KHỚP';
}
const sev={THẤP:1,'TRUNG BÌNH':2,CAO:3};
function addRisk(arr,code,level,reason,solution){arr.push({code,level,reason,solution})}
function risksFor(r){
  const T=tol(), d=r.v3_revenue||deriveRevenue(r), rs=[];
  const st=r.v3_invoice_state||invoiceState(r,d);
  if(st==='CHƯA XUẤT HĐ')addRisk(rs,'DT01','CAO','Đơn đã giao nhưng chưa tìm thấy hóa đơn theo Order ID.','Kiểm tra lại khóa Order ID; nếu đúng là chưa xuất thì lập hóa đơn và kê khai đúng kỳ.');
  if(st==='DƯ HĐ LẦN ĐẦU'||st==='DƯ HĐ SAU ĐIỀU CHỈNH')addRisk(rs,'DT02','CAO','Giá trị hóa đơn lớn hơn doanh thu phải ghi nhận theo đơn hàng.','Rà soát Order Amount/hoàn đơn và hóa đơn; lập điều chỉnh giảm hoặc thay thế nếu hóa đơn sai.');
  if(st==='THIẾU HĐ LẦN ĐẦU'||st==='THIẾU HĐ SAU ĐIỀU CHỈNH')addRisk(rs,'DT03','CAO','Giá trị hóa đơn nhỏ hơn doanh thu phải ghi nhận theo đơn hàng.','Rà soát đơn và lập hóa đơn/điều chỉnh tăng phần còn thiếu.');
  if(st==='CẦN ĐIỀU CHỈNH')addRisk(rs,'DT04','CAO','Đơn đã phát sinh hoàn/trả làm giảm nghĩa vụ doanh thu nhưng chưa có hóa đơn điều chỉnh.','Lập hóa đơn điều chỉnh giảm theo hồ sơ hoàn/trả và liên kết đúng hóa đơn gốc.');
  if(st==='ĐIỀU CHỈNH CHƯA KHỚP')addRisk(rs,'DT05','CAO','Đã có hóa đơn điều chỉnh nhưng giá trị điều chỉnh chưa khớp biến động của đơn hàng.','Đối chiếu hóa đơn gốc, số hoàn và hóa đơn điều chỉnh; sửa bằng điều chỉnh bổ sung/thay thế nếu cần.');
  if(r.income_source_present){
    if(abs(r.v3_settlement_diff_best)>T)addRisk(rs,'QT01','CAO','Doanh thu Income chuẩn + Tổng phí nguồn + điều chỉnh vẫn không khớp số TikTok quyết toán.','Kiểm tra thiếu/trùng Income hoặc khoản quyết toán ngoài cấu trúc hiện tại.');
    else if(abs(r.v3_settlement_diff_income)>T)addRisk(rs,'CP01','TRUNG BÌNH','Phí chi tiết đã map chưa đủ để khớp quyết toán nhưng Tổng phí nguồn đã khớp.','Rà soát cột Phí khác/chưa map để bổ sung loại phí chi tiết.');
    if(r.order_source_present&&r.income_source_present&&abs(r.v3_orders_income_basis_diff)>T)addRisk(rs,'DT07','THẤP','Orders khác doanh thu người bán trên Income. App chỉ dùng phần thuộc người bán để đối chiếu doanh thu/hóa đơn.','Ưu tiên Tổng phụ sau giảm giá của người bán và hoàn tiền của người bán; không dùng các trường phía khách hàng để kết luận doanh thu.');
    if(n(r.invoice_count)>0&&abs(r.v3_invoice_income_diff)>T)addRisk(rs,'DT06','TRUNG BÌNH','Doanh thu đã xuất hóa đơn khác doanh thu TikTok dùng để quyết toán.','Kiểm tra khác kỳ, hoàn/điều chỉnh và vòng đời hóa đơn; xác định chênh lệch thời điểm hay sai số thực tế.');
    if(n(r.invoice_count)>0&&abs(r.v3_settlement_diff_invoice)>T)addRisk(rs,'QT02','TRUNG BÌNH','Lấy doanh thu đã xuất HĐ trừ/cộng các phí sàn vẫn chưa ra tiền TikTok quyết toán.','So sánh doanh thu HĐ với doanh thu Income trước; sau đó kiểm tra phí, hoàn và điều chỉnh.');
    if(abs(n(r.total_fee_source))>T&&abs(n(r.total_fee_source)-n(r.v3_fee_total))>T)addRisk(rs,'CP01','TRUNG BÌNH','Tổng phí nguồn khác tổng cộng các loại phí chi tiết đã map.','Kiểm tra cột phí còn thiếu hoặc phí đang bị cộng trùng.');
    if(!r.order_source_present)addRisk(rs,'DL01','TRUNG BÌNH','Income có Order ID nhưng dữ liệu năm hiện chưa có file đơn hàng gốc tương ứng.','Giữ lại bản ghi; nhập file Tất cả đơn hàng của tháng phát sinh để ghép theo Order ID. Không xóa đơn khác tháng.');
    if(r.order_month&&r.settlement_month&&r.order_month!==r.settlement_month)addRisk(rs,'TG01','THẤP','Ngày đơn và ngày quyết toán khác tháng; đây có thể là chênh lệch thời điểm bình thường.','Theo dõi xuyên kỳ theo Order ID; chỉ xử lý khi cuối năm vẫn chưa khớp hoặc có chênh số tiền.');
  }
  if(!rs.length)addRisk(rs,'OK','THẤP','Chưa phát hiện chênh lệch trọng yếu theo các phép kiểm tra hiện tại.','Lưu hồ sơ đối chiếu và kiểm tra chứng từ đầu vào của phí theo quy trình.');
  rs.sort((a,b)=>sev[b.level]-sev[a.level]);
  return rs;
}
function enrich(r){
  const d=deriveRevenue(r);r.v3_revenue=d;
  r.v3_revenue_original=d.original;r.v3_refund=d.refund;r.v3_revenue_current=d.current;
  r.v3_revenue_source=d.source;
  r.v3_order_revenue_current=d.orderCurrent;
  r.v3_income_revenue_current=d.incomeCurrent;
  r.v3_orders_income_basis_diff=d.orderCurrent-d.incomeCurrent;
  r.v3_platform_discount_trace=d.incomeCurrent-d.orderCurrent;
  r.v3_invoice_first=d.first;r.v3_expected_adjustment=d.expectedAdj;r.v3_invoice_adjustment=d.actualAdj;r.v3_invoice_effective=d.effective;
  r.v3_invoice_total_after_adjustment=r.v3_invoice_first+r.v3_invoice_adjustment;
  r.v3_invoice_total_diff=r.v3_invoice_total_after_adjustment-r.v3_revenue_current;
  r.v3_invoice_total_check=Math.abs(r.v3_invoice_total_diff)<=tol()?'KHỚP':(r.v3_invoice_total_diff>0?'DƯ HĐ':'THIẾU HĐ');
  r.v3_invoice_diff=d.currentDiff;r.v3_invoice_state=invoiceState(r,d);
  r.v3_income_goods=n(r.seller_revenue);
  r.v3_income_goods_refund=n(r.seller_refund);
  r.v3_buyer_shipping=n(r.buyer_shipping_income);
  r.v3_buyer_shipping_refund=n(r.buyer_shipping_refund);
  r.v3_buyer_side_net=n(r.buyer_shipping_income)+n(r.buyer_shipping_refund);
  r.v3_income_revenue=incomeRevenue(r);
  r.v3_fee_total=feeDetailTotal(r);
  r.v3_fee_source=sourceFeeTotal(r);
  r.v3_fee_unmapped=r.v3_fee_source-r.v3_fee_total;
  r.v3_settlement_calc_income=r.v3_income_revenue+r.v3_fee_total+n(r.adjustment);
  r.v3_settlement_diff_income=n(r.settlement)-r.v3_settlement_calc_income;
  r.v3_settlement_calc_best=r.v3_income_revenue+r.v3_fee_source+n(r.adjustment);
  r.v3_settlement_diff_best=n(r.settlement)-r.v3_settlement_calc_best;
  r.v3_settlement_calc_invoice=r.v3_invoice_effective+r.v3_fee_total+n(r.adjustment);
  r.v3_settlement_diff_invoice=n(r.settlement)-r.v3_settlement_calc_invoice;
  r.v3_invoice_income_diff=r.v3_invoice_effective-r.v3_income_revenue;
  r.order_month=r.order_month||ym(r.created||r.income_order_date);r.settlement_month=r.settlement_month||ym(r.settlement_date);
  r.source_state=sourceState(r);r.v3_risks=risksFor(r);r.risk_level=r.v3_risks[0].level;r.risk_code=r.v3_risks.map(x=>x.code).join(', ');
  r.risk_reason=r.v3_risks.map(x=>x.reason).join(' | ');r.risk_solution=r.v3_risks.map(x=>x.solution).join(' | ');
  return r;
}
function enrichRows(){for(const r of (liveResultState?.rows||[]))enrich(r)}

const oldParseOrders=window.parseOrdersForEngine;
window.parseOrdersForEngine=async function(file){
  let headers=null,map=null,orderMap=new Map(),rowCount=0;
  const known=['Order ID','Order Status','Created Time','Delivered Time','Order Amount'];
  await forEachTableRow(file,['OrderSKUList','Tất cả đơn hàng','Sheet1'],async(rn,row)=>{
    if(!headers){const hm=makeHeaderMap(row);if(hasAnyHeader(hm,known)){headers=row;map=hm;return}if(rn<20)return;headers=row;map=hm;return}
    const id=normalizeId(getBy(row,map,['Order ID','Mã đơn hàng','order_id']));if(!id||id==='Order ID')return;rowCount++;
    let a=orderMap.get(id);if(!a){a={order_id:id,order_status:'',created:'',delivered:'',creator:'',qty:0,return_qty:0,sku_revenue:0,order_shipping_buyer:0,order_amount:0,order_refund_amount:0};orderMap.set(id,a)}
    const st=normalizeText(getBy(row,map,['Order Status','Trạng thái đơn']));if(st)a.order_status=st;
    const cr=excelDateToString(getBy(row,map,['Created Time','Thời gian tạo đơn','Ngày tạo đơn'])),dl=excelDateToString(getBy(row,map,['Delivered Time','Ngày đã giao','Ngày giao thành công']));
    if(cr&&(!a.created||dateKey(cr)<dateKey(a.created)))a.created=cr;if(dl&&(!a.delivered||dateKey(dl)>dateKey(a.delivered)))a.delivered=dl;
    const creator=normalizeText(getBy(row,map,['Creator Handle','Affiliate ID','Creator ID']));if(creator)a.creator=creator;
    a.qty+=nval(getBy(row,map,['Quantity','Số lượng']));a.return_qty+=nval(getBy(row,map,['Sku Quantity of return','SKU Quantity of return','Số lượng trả']));
    a.sku_revenue+=nval(getBy(row,map,['SKU Subtotal After Discount','SKU Subtotal after discount','Doanh thu sau giảm giá']));
    a.order_shipping_buyer=maxAbs(a.order_shipping_buyer,nval(getBy(row,map,['Shipping Fee After Discount','Original Shipping Fee','Phí vận chuyển sau giảm giá'])));
    a.order_amount=maxAbs(a.order_amount,nval(getBy(row,map,['Order Amount','Giá trị đơn hàng'])));
    a.order_refund_amount=maxAbs(a.order_refund_amount,nval(getBy(row,map,['Order Refund Amount','Giá trị hoàn đơn'])));
  },x=>setRunMessage('Đang đọc Tất cả đơn hàng: '+x.toLocaleString('vi-VN')+' dòng...'));
  if(!headers)throw new Error('Không tìm thấy dòng tiêu đề trong file Tất cả đơn hàng.');
  return {map:orderMap,count:rowCount,headers};
};

const oldBuild=window.buildLiveRows;
window.buildLiveRows=function(orders,incomes,invoices){
  const rows=oldBuild(orders,incomes,invoices);
  for(const r of rows){
    const o=orders.get(r.order_id),inc=incomes.get(r.order_id);
    if(o){Object.assign(r,{order_source_present:true,qty:n(o.qty),return_qty:n(o.return_qty),sku_revenue:n(o.sku_revenue),order_shipping_buyer:n(o.order_shipping_buyer),order_amount:n(o.order_amount),order_refund_amount:n(o.order_refund_amount)})}
    else r.order_source_present=false;
    r.income_source_present=!!inc;
    if(inc){r.seller_net=n(inc.seller_net);r.buyer_shipping_net=n(inc.buyer_shipping_net)}
    enrich(r);
  }
  return rows;
};

function riskBadge(x){return x==='CAO'?'bad':x==='TRUNG BÌNH'?'warn':'ok'}
let REV=[],COST=[];let REV_PAGE=1,COST_PAGE=1;const PAGE_SIZE=100;
function revFilter(){enrichRows();const s=t($('v3RevSearch')?.value).toLowerCase(),st=t($('v3RevStatus')?.value),risk=t($('v3RevRisk')?.value);REV=(liveResultState.rows||[]).filter(r=>r.order_source_present&&delivered(r)&&inPeriod(r.delivered)).filter(r=>(!s||t(r.order_id).toLowerCase().includes(s)||t(r.invoice_no).toLowerCase().includes(s))&&(!st||r.v3_invoice_state===st)&&(!risk||r.risk_level===risk))}
function costFilter(){enrichRows();const s=t($('v3CostSearch')?.value).toLowerCase(),risk=t($('v3CostRisk')?.value),diff=t($('v3CostDiff')?.value),T=tol();COST=(liveResultState.rows||[]).filter(r=>r.income_source_present).filter(r=>{const dIncome=abs(r.v3_invoice_income_diff)>T,dQtIncome=abs(r.v3_settlement_diff_income)>T,dQtBest=abs(r.v3_settlement_diff_best)>T,dQtInvoice=abs(r.v3_settlement_diff_invoice)>T;let okDiff=true;if(diff==='any')okDiff=dIncome||dQtBest||dQtInvoice;else if(diff==='income')okDiff=dIncome;else if(diff==='qtIncome')okDiff=dQtIncome;else if(diff==='qtBest')okDiff=dQtBest;else if(diff==='qtInvoice')okDiff=dQtInvoice;else if(diff==='none')okDiff=!dIncome&&!dQtBest&&!dQtInvoice;return (!s||t(r.order_id).toLowerCase().includes(s))&&(!risk||r.risk_level===risk)&&okDiff})}
function renderDashboard(){
  enrichRows();const rows=liveResultState.rows||[],rev=rows.filter(r=>r.order_source_present&&delivered(r)&&inPeriod(r.delivered)),cost=rows.filter(r=>r.income_source_present);
  const s=(id,v)=>{if($(id))$(id).textContent=moneyV(v)};
  s('v3OrdOriginal',sum(rev,'v3_revenue_original'));s('v3OrdRefund',sum(rev,'v3_refund'));s('v3OrdCurrent',sum(rev,'v3_revenue_current'));
  s('v3InvFirst',sum(rev,'v3_invoice_first'));s('v3InvAdj',sum(rev,'v3_invoice_adjustment'));s('v3InvTotal',sum(rev,'v3_invoice_total_after_adjustment'));s('v3InvTotalDiff',sum(rev,'v3_invoice_total_diff'));s('v3InvEffective',sum(rev,'v3_invoice_effective'));s('v3InvDiff',sum(rev,'v3_invoice_diff'));
  s('v3IncomeGoods',sum(cost,'v3_income_goods'));s('v3IncomeRefund',sum(cost,'v3_income_goods_refund'));s('v3BuyerShipping',sum(cost,'v3_buyer_shipping'));s('v3BuyerShippingRefund',sum(cost,'v3_buyer_shipping_refund'));
  s('v3IncRevenue',sum(cost,'v3_income_revenue'));s('v3Transaction',sum(cost,'transaction_fee'));s('v3Commission',sum(cost,'tiktok_commission'));s('v3Processing',sum(cost,'processing_fee'));s('v3Shipping',sum(cost,'shipping_net'));s('v3Affiliate',sum(cost,'affiliate'));s('v3Partner',sum(cost,'partner'));s('v3Adjust',sum(cost,'adjustment'));s('v3FeeTotal',sum(cost,'v3_fee_total'));s('v3FeeSource',sum(cost,'v3_fee_source'));s('v3FeeUnmapped',sum(cost,'v3_fee_unmapped'));
  s('v3Settlement',sum(cost,'settlement'));s('v3CalcIncome',sum(cost,'v3_settlement_calc_income'));s('v3DiffIncome',sum(cost,'v3_settlement_diff_income'));s('v3CalcBest',sum(cost,'v3_settlement_calc_best'));s('v3DiffBest',sum(cost,'v3_settlement_diff_best'));s('v3CalcInvoice',sum(cost,'v3_settlement_calc_invoice'));s('v3DiffInvoice',sum(cost,'v3_settlement_diff_invoice'));
  const high=rows.filter(r=>r.risk_level==='CAO').length,med=rows.filter(r=>r.risk_level==='TRUNG BÌNH').length,low=rows.filter(r=>r.risk_level==='THẤP').length;
  if($('v3High'))$('v3High').textContent=high.toLocaleString('vi-VN');if($('v3Med'))$('v3Med').textContent=med.toLocaleString('vi-VN');if($('v3Low'))$('v3Low').textContent=low.toLocaleString('vi-VN');
  const map=new Map();for(const r of rows){for(const x of(r.v3_risks||[])){if(!map.has(x.code))map.set(x.code,{...x,count:0});map.get(x.code).count++}}
  const arr=[...map.values()].sort((a,b)=>sev[b.level]-sev[a.level]||b.count-a.count);
  if($('v3RiskSummary'))$('v3RiskSummary').innerHTML=arr.map(x=>'<tr><td>'+esc(x.code)+'</td><td><span class="badge '+riskBadge(x.level)+'">'+x.level+'</span></td><td>'+x.count.toLocaleString('vi-VN')+'</td><td>'+esc(x.reason)+'</td><td>'+esc(x.solution)+'</td></tr>').join('');
}
function renderRevenue(){
  revFilter();const b=$('v3RevenueBody');if(!b)return;
  const totalPages=Math.max(1,Math.ceil(REV.length/PAGE_SIZE));
  REV_PAGE=Math.min(Math.max(1,REV_PAGE),totalPages);
  const pageRows=REV.slice((REV_PAGE-1)*PAGE_SIZE,REV_PAGE*PAGE_SIZE);
  b.innerHTML=pageRows.map(r=>{
    const result=Math.abs(n(r.v3_invoice_diff))<=tol()?'KHỚP':(n(r.v3_invoice_diff)>0?'DƯ HĐ':'THIẾU HĐ');
    return '<tr>'+
      '<td><b>'+esc(r.order_id)+'</b></td>'+
      '<td>'+esc(r.created)+'</td>'+
      '<td>'+esc(r.order_status)+'</td>'+
      '<td>'+esc(r.delivered)+'</td>'+
      '<td><b>'+moneyV(r.v3_revenue_current)+'</b></td>'+
      '<td>'+moneyV(r.v3_invoice_first)+'</td>'+
      '<td>'+moneyV(r.v3_invoice_adjustment)+'</td>'+
      '<td>'+moneyV(r.v3_invoice_diff)+'</td>'+
      '<td><b>'+esc(result)+'</b></td>'+
      '<td><span class="badge '+riskBadge(r.risk_level)+'">'+esc(r.risk_level)+'</span></td>'+
      '<td>'+esc(r.risk_solution||'')+'</td>'+
    '</tr>';
  }).join('')||'<tr><td colspan="11" class="muted">Không có dữ liệu phù hợp.</td></tr>';
  const states=[...new Set(REV.map(r=>r.v3_invoice_state))].sort(),sel=$('v3RevStatus');
  if(sel){const cur=sel.value;sel.innerHTML='<option value="">Tất cả trạng thái HĐ</option>'+states.map(x=>'<option>'+esc(x)+'</option>').join('');sel.value=cur}
  if($('v3RevCount'))$('v3RevCount').textContent=REV.length.toLocaleString('vi-VN')+' đơn đã giao thuộc kỳ · Trang '+REV_PAGE+'/'+totalPages;
  const pg=$('v3RevPage');if(pg)pg.textContent='Trang '+REV_PAGE+'/'+totalPages;
}
function renderCost(){
  costFilter();const b=$('v3CostBody');if(!b)return;
  const totalPages=Math.max(1,Math.ceil(COST.length/PAGE_SIZE));COST_PAGE=Math.min(COST_PAGE,totalPages);const pageRows=COST.slice((COST_PAGE-1)*PAGE_SIZE,COST_PAGE*PAGE_SIZE);b.innerHTML=pageRows.map(r=>'<tr>'+
    '<td>'+esc(r.order_id)+'</td><td>'+esc(r.created||r.income_order_date)+'</td><td>'+esc(r.settlement_date)+'</td>'+
    '<td>'+moneyV(r.seller_revenue)+'</td><td>'+moneyV(r.seller_refund)+'</td><td>'+moneyV(r.buyer_shipping_income)+'</td><td>'+moneyV(r.buyer_shipping_refund)+'</td>'+
    '<td><b>'+moneyV(r.v3_income_revenue)+'</b></td><td>'+moneyV(r.v3_invoice_effective)+'</td><td>'+moneyV(r.v3_invoice_income_diff)+'</td>'+
    '<td>'+moneyV(r.transaction_fee)+'</td><td>'+moneyV(r.tiktok_commission)+'</td><td>'+moneyV(r.processing_fee)+'</td>'+
    '<td>'+moneyV(r.shipping_actual)+'</td><td>'+moneyV(r.shipping_platform_discount)+'</td><td>'+moneyV(r.failed_delivery_subsidy)+'</td><td>'+moneyV(r.return_shipping_actual)+'</td><td>'+moneyV(r.shipping_net)+'</td>'+
    '<td>'+moneyV(r.affiliate_base)+'</td><td>'+moneyV(r.affiliate_ads)+'</td><td>'+moneyV(r.partner_base)+'</td><td>'+moneyV(r.partner_ads)+'</td>'+
    '<td>'+moneyV(r.adjustment)+'</td><td>'+moneyV(r.v3_fee_total)+'</td><td>'+moneyV(r.v3_fee_source)+'</td><td>'+moneyV(r.v3_fee_unmapped)+'</td>'+
    '<td>'+moneyV(r.settlement)+'</td><td>'+moneyV(r.v3_settlement_calc_income)+'</td><td>'+moneyV(r.v3_settlement_diff_income)+'</td>'+
    '<td><b>'+moneyV(r.v3_settlement_calc_best)+'</b></td><td><b>'+moneyV(r.v3_settlement_diff_best)+'</b></td>'+
    '<td>'+moneyV(r.v3_settlement_calc_invoice)+'</td><td>'+moneyV(r.v3_settlement_diff_invoice)+'</td>'+
    '<td>'+esc(r.order_month||'')+'</td><td>'+esc(r.settlement_month||'')+'</td><td>'+esc(r.source_state)+'</td><td><span class="badge '+riskBadge(r.risk_level)+'">'+r.risk_level+'</span></td><td>'+esc(r.risk_reason)+'</td><td>'+esc(r.risk_solution)+'</td></tr>').join('');
  if($('v3CostCount')){const df=t($('v3CostDiff')?.value);$('v3CostCount').textContent=COST.length.toLocaleString('vi-VN')+' Order ID trong Income'+(df?' · đang lọc chênh lệch':'')+' · Trang '+COST_PAGE+'/'+totalPages;}const pg=$('v3CostPage');if(pg)pg.textContent='Trang '+COST_PAGE+'/'+totalPages;
}
window.v3ApplyRevenue=()=>{REV_PAGE=1;renderRevenue()};window.v3ApplyCost=()=>{COST_PAGE=1;renderCost()};window.v3RevPrev=()=>{REV_PAGE=Math.max(1,REV_PAGE-1);renderRevenue()};window.v3RevNext=()=>{REV_PAGE++;renderRevenue()};window.v3CostPrev=()=>{COST_PAGE=Math.max(1,COST_PAGE-1);renderCost()};window.v3CostNext=()=>{COST_PAGE++;renderCost()};
window.v3ExportRevenue=()=>objectRowsToXlsx(REV,'DOI_CHIEU_DOANH_THU_V3.xlsx','Doanh thu',true);
window.v3ExportCost=()=>objectRowsToXlsx(COST,'DOI_CHIEU_INCOME_CHI_PHI_QUYET_TOAN_V3.xlsx','Income',true);

function install(){
 const notice=$('standaloneNotice');if(notice)notice.innerHTML='<b>Luồng 1:</b> Tất cả đơn hàng + HĐ = doanh thu/HĐ theo ngày giao. <b>Luồng 2:</b> Income = doanh thu TikTok dùng quyết toán + từng loại phí + điều chỉnh = tiền TikTok trả. Đơn Income khác tháng vẫn được giữ xuyên năm.';
 const dash=$('dashboard');if(dash)dash.innerHTML=[
 '<div class="card section"><h2>Tổng quan kiểm soát kế toán</h2><div class="muted">Hiển thị đầy đủ doanh thu đơn hàng, vòng đời hóa đơn, từng nhóm chi phí và phép kiểm tra tiền TikTok quyết toán.</div></div>',
 '<div class="card section"><h3>A. Doanh thu theo Tất cả đơn hàng & hóa đơn</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(150px,1fr))"><div class="card kpi"><span class="muted">GT đơn gốc (Order Amount)</span><b id="v3OrdOriginal">0</b></div><div class="card kpi"><span class="muted">Hoàn đơn</span><b id="v3OrdRefund">0</b></div><div class="card kpi"><span class="muted">Doanh thu đối soát hiện tại</span><b id="v3OrdCurrent">0</b></div><div class="card kpi"><span class="muted">HĐ lần đầu</span><b id="v3InvFirst">0</b></div><div class="card kpi"><span class="muted">HĐ điều chỉnh</span><b id="v3InvAdj">0</b></div><div class="card kpi"><span class="muted">Tổng HĐ = lần đầu + điều chỉnh</span><b id="v3InvTotal">0</b></div><div class="card kpi"><span class="muted">Chênh Tổng HĐ - DT cần xuất</span><b id="v3InvTotalDiff">0</b></div><div class="card kpi"><span class="muted">HĐ hiệu lực theo vòng đời</span><b id="v3InvEffective">0</b></div><div class="card kpi"><span class="muted">Chênh HĐ hiệu lực</span><b id="v3InvDiff">0</b></div></div></div>',
 '<div class="card section"><h3>B. Income - cấu thành doanh thu & chi phí quyết toán</h3><div class="note" style="margin-bottom:10px"><b>Doanh thu Income dùng cho kế toán/đối soát = DT hàng sau giảm của người bán + Hoàn tiền của người bán + VC người mua + Hoàn VC người mua.</b></div><div class="kpis" style="grid-template-columns:repeat(4,minmax(150px,1fr))"><div class="card kpi"><span class="muted">DT hàng sau giảm</span><b id="v3IncomeGoods">0</b></div><div class="card kpi"><span class="muted">Hoàn hàng</span><b id="v3IncomeRefund">0</b></div><div class="card kpi"><span class="muted">VC người mua</span><b id="v3BuyerShipping">0</b></div><div class="card kpi"><span class="muted">Hoàn VC người mua</span><b id="v3BuyerShippingRefund">0</b></div><div class="card kpi"><span class="muted">Doanh thu Income đối soát</span><b id="v3IncRevenue">0</b></div><div class="card kpi"><span class="muted">Phí giao dịch</span><b id="v3Transaction">0</b></div><div class="card kpi"><span class="muted">Hoa hồng TikTok</span><b id="v3Commission">0</b></div><div class="card kpi"><span class="muted">Phí xử lý</span><b id="v3Processing">0</b></div><div class="card kpi"><span class="muted">VC phí sàn thuần</span><b id="v3Shipping">0</b></div><div class="card kpi"><span class="muted">Affiliate</span><b id="v3Affiliate">0</b></div><div class="card kpi"><span class="muted">Đối tác</span><b id="v3Partner">0</b></div><div class="card kpi"><span class="muted">Điều chỉnh</span><b id="v3Adjust">0</b></div><div class="card kpi"><span class="muted">Phí chi tiết đã map</span><b id="v3FeeTotal">0</b></div><div class="card kpi"><span class="muted">Tổng phí nguồn Income</span><b id="v3FeeSource">0</b></div><div class="card kpi"><span class="muted">Phí khác/chưa map</span><b id="v3FeeUnmapped">0</b></div></div></div>',
 '<div class="card section"><h3>C. Kiểm tra tiền TikTok quyết toán</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(150px,1fr))"><div class="card kpi"><span class="muted">TikTok quyết toán</span><b id="v3Settlement">0</b></div><div class="card kpi"><span class="muted">QT tính từ phí chi tiết</span><b id="v3CalcIncome">0</b></div><div class="card kpi"><span class="muted">Chênh QT phí chi tiết</span><b id="v3DiffIncome">0</b></div><div class="card kpi"><span class="muted">QT chuẩn theo Tổng phí nguồn</span><b id="v3CalcBest">0</b></div><div class="card kpi"><span class="muted">Chênh QT chuẩn</span><b id="v3DiffBest">0</b></div><div class="card kpi"><span class="muted">HĐ đã xuất + phí + ĐC</span><b id="v3CalcInvoice">0</b></div><div class="card kpi"><span class="muted">Chênh QT theo HĐ</span><b id="v3DiffInvoice">0</b></div></div><div class="note" style="margin-top:10px">Phép kiểm chính theo góc nhìn người bán: <b>Doanh thu Income đối soát + Tổng phí nguồn Income + Điều chỉnh = TikTok quyết toán</b>. Các trường phía khách hàng không dùng để xác định doanh thu.</div></div>',
 '<div class="card section"><h3>D. Ma trận rủi ro & phương án xử lý</h3><div class="kpis" style="grid-template-columns:repeat(3,minmax(150px,1fr));margin-bottom:10px"><div class="card kpi"><span class="muted">Rủi ro cao</span><b id="v3High">0</b></div><div class="card kpi"><span class="muted">Rủi ro trung bình</span><b id="v3Med">0</b></div><div class="card kpi"><span class="muted">Rủi ro thấp</span><b id="v3Low">0</b></div></div><div class="tablewrap"><table><thead><tr><th>Mã</th><th>Mức</th><th>Số dòng</th><th>Rủi ro cụ thể</th><th>Phương án xử lý</th></tr></thead><tbody id="v3RiskSummary"></tbody></table></div></div>'
 ].join('');
 const inv=$('invoice');if(inv)inv.innerHTML=[
 '<div class="card section"><h2>Đối chiếu doanh thu & hóa đơn</h2><div class="muted">Bảng chính chỉ giữ các chỉ tiêu cần kiểm tra nhanh. Doanh thu cần xuất HĐ ưu tiên theo Income khi có dữ liệu; các thông tin kỹ thuật chi tiết vẫn được dùng trong logic đối soát và truy vết.</div></div>',
 '<div class="card section"><div class="toolbar"><input id="v3RevSearch" placeholder="Order ID / số HĐ" oninput="v3ApplyRevenue()"><select id="v3RevStatus" onchange="v3ApplyRevenue()"><option value="">Tất cả trạng thái HĐ</option></select><select id="v3RevRisk" onchange="v3ApplyRevenue()"><option value="">Tất cả rủi ro</option><option>CAO</option><option>TRUNG BÌNH</option><option>THẤP</option></select><button class="btn primary" onclick="v3ExportRevenue()">Xuất Excel</button><span id="v3RevCount" class="muted"></span></div><div class="tablewrap"><table><thead><tr><th>Order ID</th><th>Ngày tạo đơn</th><th>Trạng thái đơn</th><th>Ngày giao</th><th>Doanh thu cần xuất HĐ</th><th>HĐ đã xuất</th><th>HĐ đã điều chỉnh</th><th>Chênh lệch HĐ</th><th>Kết quả</th><th>Rủi ro</th><th>Gợi ý xử lý</th></tr></thead><tbody id="v3RevenueBody"></tbody></table></div><div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:10px"><button class="btn" onclick="v3RevPrev()">← Trước</button><span id="v3RevPage" class="muted"></span><button class="btn" onclick="v3RevNext()">Sau →</button></div></div>'
 ].join('');
 const fees=$('fees');if(fees)fees.innerHTML=[
 '<div class="card section"><h2>Income - doanh thu, chi phí & quyết toán TikTok</h2><div class="muted">Kiểm tra đồng thời: <b>(1) doanh thu Income có khớp HĐ đã xuất không</b>; <b>(2) doanh thu + từng loại phí + điều chỉnh có khớp tiền TikTok quyết toán không</b>. Income của đơn khác tháng không bị loại.</div></div>',
 '<div class="card section"><div class="toolbar"><input id="v3CostSearch" placeholder="Order ID" oninput="v3ApplyCost()"><select id="v3CostRisk" onchange="v3ApplyCost()"><option value="">Tất cả rủi ro</option><option>CAO</option><option>TRUNG BÌNH</option><option>THẤP</option></select><select id="v3CostDiff" onchange="v3ApplyCost()"><option value="">Tất cả chênh lệch</option><option value="any">Có chênh lệch</option><option value="income">Chênh DT HĐ - Income</option><option value="qtBest">Chênh QT chuẩn theo Tổng phí nguồn</option><option value="qtIncome">Chênh QT theo phí chi tiết</option><option value="qtInvoice">Chênh quyết toán theo HĐ</option><option value="none">Không chênh lệch</option></select><button class="btn primary" onclick="v3ExportCost()">Xuất Excel</button><span id="v3CostCount" class="muted"></span></div><div class="tablewrap"><table><thead><tr><th>Order ID</th><th>Ngày đơn</th><th>Ngày QT</th><th>DT hàng sau giảm</th><th>Hoàn hàng</th><th>VC người mua</th><th>Hoàn VC người mua</th><th>DT Income đối soát</th><th>HĐ đã xuất</th><th>Chênh DT HĐ-Income</th><th>Phí GD</th><th>HH TikTok</th><th>Phí xử lý</th><th>VC thực tế</th><th>CK VC nền tảng</th><th>Trợ cấp giao thất bại</th><th>VC trả hàng</th><th>VC phí sàn thuần</th><th>Affiliate</th><th>Affiliate Ads</th><th>Đối tác</th><th>Đối tác Ads</th><th>Điều chỉnh</th><th>Phí chi tiết đã map</th><th>Tổng phí nguồn</th><th>Phí khác/chưa map</th><th>TikTok QT</th><th>QT tính phí chi tiết</th><th>Chênh QT chi tiết</th><th>QT chuẩn theo Tổng phí</th><th>Chênh QT chuẩn</th><th>HĐ+phí+ĐC</th><th>Chênh QT theo HĐ</th><th>Tháng đơn</th><th>Tháng QT</th><th>Nguồn</th><th>Mức RR</th><th>Rủi ro cụ thể</th><th>Phương án xử lý</th></tr></thead><tbody id="v3CostBody"></tbody></table></div><div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:10px"><button class="btn" onclick="v3CostPrev()">← Trước</button><span id="v3CostPage" class="muted"></span><button class="btn" onclick="v3CostNext()">Sau →</button></div></div>'
 ].join('');
 renderDashboard();renderRevenue();renderCost();
}




/* ===== V3.6 FAST YEAR STORE: tháng riêng + tổng hợp năm chống trùng ===== */
const FAST_DB_NAME='NHT_RECON_FAST_DB';
const FAST_DB_VERSION=1;
let fastDbPromise=null;
function openFastDb(){
  if(fastDbPromise)return fastDbPromise;
  fastDbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(FAST_DB_NAME,FAST_DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('period_compact')){
        const st=db.createObjectStore('period_compact',{keyPath:'id'});
        st.createIndex('company_year','companyYear',{unique:false});
        st.createIndex('company','company',{unique:false});
        st.createIndex('year','year',{unique:false});
      }
      if(!db.objectStoreNames.contains('annual_light')){
        db.createObjectStore('annual_light',{keyPath:'id'});
      }
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return fastDbPromise;
}
function fastPut(store,obj){return openFastDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=()=>resolve(obj);tx.onerror=()=>reject(tx.error)}))}
function fastGet(store,id){return openFastDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),rq=tx.objectStore(store).get(id);rq.onsuccess=()=>resolve(rq.result||null);rq.onerror=()=>reject(rq.error)}))}
function fastGetAll(store){return openFastDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),rq=tx.objectStore(store).getAll();rq.onsuccess=()=>resolve(rq.result||[]);rq.onerror=()=>reject(rq.error)}))}
function dbGetPeriodDirect(id){return openNhtDb().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction('periods','readonly'),rq=tx.objectStore('periods').get(id);rq.onsuccess=()=>resolve(rq.result||null);rq.onerror=()=>reject(rq.error)}))}

function incomeEventKey(r){
  return [
    t(r.order_id),t(r.settlement_date),n(r.seller_net),n(r.buyer_shipping_net),
    n(r.transaction_fee),n(r.tiktok_commission),n(r.processing_fee),n(r.shipping_net),
    n(r.affiliate),n(r.partner),n(r.adjustment),n(r.settlement)
  ].join('|');
}
function invoiceEventKey(it){return [t(it.no),t(it.date),t(it.status),n(it.amount)].join('|')}
function orderCompact(r){
  return {
    order_id:t(r.order_id),order_status:t(r.order_status),created:t(r.created),delivered:t(r.delivered),creator:t(r.creator),
    qty:n(r.qty),return_qty:n(r.return_qty),sku_revenue:n(r.sku_revenue),order_shipping_buyer:n(r.order_shipping_buyer),
    order_amount:n(r.order_amount),order_refund_amount:n(r.order_refund_amount),order_source_present:!!r.order_source_present
  };
}
function incomeCompact(r){
  return {
    key:incomeEventKey(r),order_id:t(r.order_id),income_order_date:t(r.income_order_date||r.created),settlement_date:t(r.settlement_date),
    seller_net:n(r.seller_net),buyer_shipping_net:n(r.buyer_shipping_net),transaction_fee:n(r.transaction_fee),
    tiktok_commission:n(r.tiktok_commission),processing_fee:n(r.processing_fee),shipping_net:n(r.shipping_net),
    affiliate:n(r.affiliate),partner:n(r.partner),adjustment:n(r.adjustment),settlement:n(r.settlement),total_fee_source:n(r.total_fee_source)
  };
}
function buildPeriodCompactV36(rows,m,id){
  const orders=[],income=[],invoices=[],orderIds=new Set(),seenInv=new Set();
  for(const r0 of rows){
    const r=enrich(r0);
    if(r.order_source_present||r.order_status||r.delivered){orders.push(orderCompact(r));orderIds.add(t(r.order_id))}
    if(r.income_source_present||abs(r.settlement)>tol()||abs(r.v3_income_revenue)>tol()){
      income.push(incomeCompact(r));orderIds.add(t(r.order_id));
    }
    for(const it of (r.invoice_items||[])){
      const k=invoiceEventKey(it);if(seenInv.has(k))continue;seenInv.add(k);
      invoices.push({key:k,order_id:t(r.order_id),no:t(it.no),date:t(it.date),status:t(it.status),amount:n(it.amount)});
      orderIds.add(t(r.order_id));
    }
  }
  const rr=rows.map(x=>enrich(x));
  const summary={
    orderCount:orderIds.size,
    revenueOriginal:sum(rr,'v3_revenue_original'),refund:sum(rr,'v3_refund'),required:sum(rr,'v3_revenue_current'),
    invFirst:sum(rr,'v3_invoice_first'),invAdj:sum(rr,'v3_invoice_adjustment'),invTotal:sum(rr,'v3_invoice_total_after_adjustment'),
    invTotalDiff:sum(rr,'v3_invoice_total_diff'),invEffective:sum(rr,'v3_invoice_effective'),invDiff:sum(rr,'v3_invoice_diff'),
    sellerNet:sum(rr,'seller_net'),buyerShipping:sum(rr,'buyer_shipping_net'),incomeRevenue:sum(rr,'v3_income_revenue'),
    transaction:sum(rr,'transaction_fee'),commission:sum(rr,'tiktok_commission'),processing:sum(rr,'processing_fee'),
    shipping:sum(rr,'shipping_net'),affiliate:sum(rr,'affiliate'),partner:sum(rr,'partner'),adjustment:sum(rr,'adjustment'),
    feeTotal:sum(rr,'v3_fee_total'),settlement:sum(rr,'settlement'),calcIncome:sum(rr,'v3_settlement_calc_income'),
    diffIncome:sum(rr,'v3_settlement_diff_income'),calcInvoice:sum(rr,'v3_settlement_calc_invoice'),diffInvoice:sum(rr,'v3_settlement_diff_invoice')
  };
  return {id,company:m.company,companyKey:m.company.toUpperCase(),year:m.year,marketplace:m.marketplace,companyYear:m.company.toUpperCase()+'||'+m.year,period:m.period,from:m.from,to:m.to,note:m.note,savedAt:new Date().toISOString(),orders,income,invoices,summary};
}

function preferOrder(a,b){
  if(!a)return b;
  const score=x=>(x.delivered?4:0)+(x.created?2:0)+(x.order_status?2:0)+(abs(x.order_amount)>0?3:0)+(abs(x.sku_revenue)>0?1:0)+(abs(x.order_refund_amount)>0?1:0);
  return score(b)>=score(a)?b:a;
}
function annualLightFromPeriods(periods,meta){
  const orderMap=new Map(),incomeMap=new Map(),invoiceMap=new Map();
  const orderPeriods=new Map(),incomeDup=new Map(),invoiceDup=new Map();
  for(const p of periods){
    for(const o of(p.orders||[])){
      const id=t(o.order_id);if(!id)continue;
      orderMap.set(id,preferOrder(orderMap.get(id),o));
      if(!orderPeriods.has(id))orderPeriods.set(id,new Set());orderPeriods.get(id).add(p.id);
    }
    for(const e of(p.income||[])){
      if(incomeMap.has(e.key))incomeDup.set(e.key,(incomeDup.get(e.key)||1)+1);
      else incomeMap.set(e.key,e);
      const id=t(e.order_id);if(!orderPeriods.has(id))orderPeriods.set(id,new Set());orderPeriods.get(id).add(p.id);
    }
    for(const it of(p.invoices||[])){
      if(invoiceMap.has(it.key))invoiceDup.set(it.key,(invoiceDup.get(it.key)||1)+1);
      else invoiceMap.set(it.key,it);
      const id=t(it.order_id);if(!orderPeriods.has(id))orderPeriods.set(id,new Set());orderPeriods.get(id).add(p.id);
    }
  }
  const incByOrder=new Map(),invByOrder=new Map();
  for(const e of incomeMap.values()){
    let a=incByOrder.get(e.order_id);if(!a){a={seller_net:0,buyer_shipping_net:0,transaction_fee:0,tiktok_commission:0,processing_fee:0,shipping_net:0,affiliate:0,partner:0,adjustment:0,settlement:0,total_fee_source:0,income_order_date:'',settlement_date:''};incByOrder.set(e.order_id,a)}
    for(const k of ['seller_net','buyer_shipping_net','transaction_fee','tiktok_commission','processing_fee','shipping_net','affiliate','partner','adjustment','settlement','total_fee_source'])a[k]+=n(e[k]);
    if(e.income_order_date&&(!a.income_order_date||dateKey(e.income_order_date)<dateKey(a.income_order_date)))a.income_order_date=e.income_order_date;
    if(e.settlement_date&&(!a.settlement_date||dateKey(e.settlement_date)>dateKey(a.settlement_date)))a.settlement_date=e.settlement_date;
  }
  for(const it of invoiceMap.values()){if(!invByOrder.has(it.order_id))invByOrder.set(it.order_id,[]);invByOrder.get(it.order_id).push(it)}
  const ids=new Set([...orderMap.keys(),...incByOrder.keys(),...invByOrder.keys()]);
  const sums={revenueOriginal:0,refund:0,required:0,invFirst:0,invAdj:0,invTotal:0,invTotalDiff:0,invEffective:0,invDiff:0,sellerNet:0,buyerShipping:0,incomeRevenue:0,transaction:0,commission:0,processing:0,shipping:0,affiliate:0,partner:0,adjustment:0,feeTotal:0,settlement:0,calcIncome:0,diffIncome:0,calcInvoice:0,diffInvoice:0};
  const statusCounts={},riskMap=new Map();
  for(const id of ids){
    const o=orderMap.get(id)||{},inc=incByOrder.get(id)||{},items=invByOrder.get(id)||[];
    const r={order_id:id,...o,...inc,order_source_present:orderMap.has(id),income_source_present:incByOrder.has(id),invoice_items:items};
    if(typeof recomputeInvoiceFromItems==='function')recomputeInvoiceFromItems(r);
    enrich(r);
    const map={revenueOriginal:'v3_revenue_original',refund:'v3_refund',required:'v3_revenue_current',invFirst:'v3_invoice_first',invAdj:'v3_invoice_adjustment',invTotal:'v3_invoice_total_after_adjustment',invTotalDiff:'v3_invoice_total_diff',invEffective:'v3_invoice_effective',invDiff:'v3_invoice_diff',sellerNet:'seller_net',buyerShipping:'buyer_shipping_net',incomeRevenue:'v3_income_revenue',transaction:'transaction_fee',commission:'tiktok_commission',processing:'processing_fee',shipping:'shipping_net',affiliate:'affiliate',partner:'partner',adjustment:'adjustment',feeTotal:'v3_fee_total',settlement:'settlement',calcIncome:'v3_settlement_calc_income',diffIncome:'v3_settlement_diff_income',calcInvoice:'v3_settlement_calc_invoice',diffInvoice:'v3_settlement_diff_invoice'};
    for(const [k,src] of Object.entries(map))sums[k]+=n(r[src]);
    statusCounts[r.v3_invoice_state]=(statusCounts[r.v3_invoice_state]||0)+1;
    for(const x of(r.v3_risks||[])){if(!riskMap.has(x.code))riskMap.set(x.code,{...x,count:0});riskMap.get(x.code).count++}
  }
  let crossPeriod=0;for(const s of orderPeriods.values())if(s.size>1)crossPeriod++;
  const duplicateStats={crossPeriodOrders:crossPeriod,duplicateIncomeEvents:incomeDup.size,duplicateInvoiceEvents:invoiceDup.size,uniqueOrders:ids.size,uniqueIncomeEvents:incomeMap.size,uniqueInvoices:invoiceMap.size};
  return {id:[meta.company.toUpperCase(),meta.marketplace,meta.year].join('||'),company:meta.company,companyKey:meta.company.toUpperCase(),year:meta.year,marketplace:meta.marketplace,periodIds:periods.map(p=>p.id),updatedAt:new Date().toISOString(),summary:sums,statusCounts,risks:[...riskMap.values()],duplicateStats};
}
async function rebuildAnnualLightV36(meta){
  const all=await fastGetAll('period_compact');
  const periods=all.filter(p=>p.companyKey===meta.company.toUpperCase()&&Number(p.year)===Number(meta.year)&&p.marketplace===meta.marketplace);
  const a=annualLightFromPeriods(periods,meta);await fastPut('annual_light',a);return a;
}

window.saveCurrentPeriod=async function(showMessage=true){
  const rows=(window.__CURRENT_PERIOD_ROWS?.length?window.__CURRENT_PERIOD_ROWS:(liveResultState?.rows||[]));
  const m=currentPeriodMeta();
  if(!rows.length){if(showMessage)alert('Chưa có kết quả để lưu.');return false}
  if(!m.company||!m.year||!m.period){if(showMessage)alert('Vui lòng nhập Tên công ty, Năm dữ liệu và Tên kỳ.');return false}
  const id=[m.company.toUpperCase(),m.marketplace,m.year,m.period.toUpperCase()].join('||');
  const existing=await dbGetPeriodDirect(id);
  const counts={};for(const r of rows)counts[r.result]=(counts[r.result]||0)+1;
  const summary={orderCount:new Set(rows.map(r=>r.order_id).filter(Boolean)).size,requiredInvoice:sum(rows,'v3_revenue_current'),settlement:sum(rows,'settlement'),statusCounts:counts};
  await dbPutPeriod({id,company:m.company,companyKey:m.company.toUpperCase(),year:m.year,companyYear:m.company.toUpperCase()+'||'+m.year,period:m.period,from:m.from,to:m.to,marketplace:m.marketplace,note:m.note,savedAt:new Date().toISOString(),createdAt:existing?.createdAt||new Date().toISOString(),summary,rows});
  await fastPut('period_compact',buildPeriodCompactV36(rows,m,id));
  await rebuildAnnualLightV36(m);
  await refreshAnnualSelectors();
  if(showMessage)alert(existing?'Đã cập nhật kỳ. Tổng hợp năm đã rebuild bằng dữ liệu chống trùng.':'Đã lưu kỳ. Tổng hợp năm đã cập nhật bằng dữ liệu chống trùng.');
  return true;
};

window.loadLastAnnualOnOpen=async function(){
  loadFormulaInputs?.();
  const compact=await fastGetAll('period_compact');
  if(!compact.length)return;
  const last=compact.slice().sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)))[0];
  const v=(id,val)=>{const e=$(id);if(e)e.value=val||''};v('companyName',last.company);v('dataYear',last.year);v('marketplaceSelect',last.marketplace);v('periodName',last.period);v('fromDate',last.from);v('toDate',last.to);
  const detail=await dbGetPeriodDirect(last.id);
  if(detail?.rows?.length){window.__CURRENT_PERIOD_ROWS=detail.rows;liveResultState.rows=detail.rows;liveResultState.invoiceRows=detail.rows;liveResultState.feesRows=detail.rows;enrichRows();renderDashboard();renderRevenue();renderCost()}
  await refreshAnnualSelectors();
};

async function ensureCompactMigrationV36(){
  const existing=await fastGetAll('period_compact');if(existing.length)return;
  const old=await dbGetAllPeriods();
  for(const p of old){if(!Array.isArray(p.rows)||!p.rows.length)continue;const m={company:p.company,year:p.year,marketplace:p.marketplace,period:p.period,from:p.from,to:p.to,note:p.note};await fastPut('period_compact',buildPeriodCompactV36(p.rows,m,p.id))}
  const groups=new Map();for(const p of await fastGetAll('period_compact')){const k=[p.companyKey,p.marketplace,p.year].join('||');if(!groups.has(k))groups.set(k,{company:p.company,year:p.year,marketplace:p.marketplace})}
  for(const m of groups.values())await rebuildAnnualLightV36(m);
}


/* ===== V3.4 TỔNG HỢP NĂM CHI TIẾT ===== */
function installAnnualV34(){
  const sec=$('annual'); if(!sec)return;
  sec.innerHTML=[
    '<div class="card section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2>Tổng hợp năm - kiểm soát kế toán</h2><div class="muted">Tổng hợp theo dữ liệu đã lưu trong năm. Tách 3 lớp: Doanh thu & HĐ, Income & chi phí, Quyết toán TikTok. Các đơn Income khác tháng vẫn được giữ theo Order ID.</div></div><div><button class="btn" onclick="exportDatabaseBackup()">Sao lưu dữ liệu</button> <label class="btn" style="cursor:pointer">Khôi phục dữ liệu<input type="file" id="restoreDbFile" accept=".json" style="display:none" onchange="restoreDatabaseBackup(this.files[0])"></label></div></div></div>',
    '<div class="card section"><div class="grid3"><div><label class="muted">Công ty</label><select id="annualCompany" onchange="renderAnnualSummary()"><option value="">Chọn công ty</option></select></div><div><label class="muted">Năm</label><select id="annualYear" onchange="renderAnnualSummary()"><option value="">Chọn năm</option></select></div><div><label class="muted">Sàn</label><select id="annualMarketplace" onchange="renderAnnualSummary()"><option value="">Tất cả sàn</option><option value="tiktok">TikTok Shop</option><option value="shopee">Shopee</option><option value="custom">Sàn tùy chỉnh</option></select></div></div><div class="grid3" style="margin-top:10px"><div><label class="muted">Từ ngày</label><input id="annualFrom" type="date" onchange="renderAnnualSummary()"></div><div><label class="muted">Đến ngày</label><input id="annualTo" type="date" onchange="renderAnnualSummary()"></div><div><label class="muted">Tìm tên kỳ</label><input id="annualPeriodText" placeholder="Ví dụ: Tháng 9" oninput="renderAnnualSummary()"></div></div><div style="margin-top:10px"><button class="btn" onclick="clearAnnualFilters()">Xóa bộ lọc</button> <button class="btn primary" onclick="exportAnnualRows()">Xuất dữ liệu năm</button></div></div>',
    '<div class="kpis section" style="grid-template-columns:repeat(4,minmax(160px,1fr))"><div class="card kpi"><span class="muted">Số kỳ đã lưu</span><b id="annualPeriods">0</b></div><div class="card kpi"><span class="muted">Order ID duy nhất</span><b id="annualOrders">0</b></div><div class="card kpi"><span class="muted">Doanh thu phải xuất HĐ</span><b id="annualRequired">0</b></div><div class="card kpi"><span class="muted">TikTok quyết toán</span><b id="annualSettlement">0</b></div></div>',
    '<div class="card section"><h3>Kiểm soát trùng giữa các kỳ</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(160px,1fr))"><div class="card kpi"><span class="muted">Order ID xuất hiện nhiều kỳ</span><b id="annualCrossPeriod">0</b></div><div class="card kpi"><span class="muted">Income bị trùng đã loại</span><b id="annualIncomeDup">0</b></div><div class="card kpi"><span class="muted">Hóa đơn bị trùng đã loại</span><b id="annualInvoiceDup">0</b></div><div class="card kpi"><span class="muted">Order ID duy nhất sau gộp</span><b id="annualUniqueAfterDedupe">0</b></div></div><div class="note" style="margin-top:10px">Order ID xuất hiện ở nhiều kỳ không tự động coi là lỗi: có thể là quyết toán/hoàn/điều chỉnh kỳ sau. Chỉ các sự kiện Income hoặc hóa đơn có cùng khóa sự kiện mới bị loại trùng.</div></div><div class="card section"><h3>A. Doanh thu & vòng đời hóa đơn năm</h3><div class="tablewrap"><table><tbody><tr><td>Giá trị đơn gốc (Orders)</td><td id="annualOrderOriginal">0</td></tr><tr><td>Hoàn đơn</td><td id="annualOrderRefund">0</td></tr><tr><td><b>Doanh thu phải xuất hiện tại</b></td><td id="annualRequired2"><b>0</b></td></tr><tr><td>HĐ lần đầu</td><td id="annualInvFirst">0</td></tr><tr><td>HĐ điều chỉnh</td><td id="annualInvAdj">0</td></tr><tr><td><b>Tổng HĐ = lần đầu + điều chỉnh</b></td><td id="annualInvTotal"><b>0</b></td></tr><tr><td>Chênh Tổng HĐ - DT cần xuất</td><td id="annualInvTotalDiff">0</td></tr><tr><td>HĐ hiệu lực theo vòng đời</td><td id="annualInvEffective">0</td></tr><tr><td>Chênh HĐ hiệu lực</td><td id="annualInvDiff">0</td></tr></tbody></table></div></div>',
    '<div class="card section"><h3>B. Income - doanh thu & chi phí năm</h3><div class="tablewrap"><table><tbody><tr><td>Doanh thu hàng hóa sau hoàn</td><td id="annualSellerNet">0</td></tr><tr><td>VC người mua sau hoàn</td><td id="annualBuyerShipping">0</td></tr><tr><td><b>Doanh thu Income</b></td><td id="annualIncomeRevenue"><b>0</b></td></tr><tr><td>Phí giao dịch</td><td id="annualTransactionFee">0</td></tr><tr><td>Hoa hồng TikTok</td><td id="annualCommission">0</td></tr><tr><td>Phí xử lý đơn hàng</td><td id="annualProcessing">0</td></tr><tr><td>Vận chuyển thuần</td><td id="annualShippingNet">0</td></tr><tr><td>Affiliate</td><td id="annualAffiliate">0</td></tr><tr><td>Đối tác liên kết</td><td id="annualPartner">0</td></tr><tr><td>Điều chỉnh</td><td id="annualAdjustment">0</td></tr><tr><td><b>Tổng chi phí chi tiết</b></td><td id="annualFeeTotal"><b>0</b></td></tr></tbody></table></div></div>',
    '<div class="card section"><h3>C. Kiểm tra tiền quyết toán năm</h3><div class="tablewrap"><table><tbody><tr><td><b>TikTok quyết toán thực tế</b></td><td id="annualSettlement2"><b>0</b></td></tr><tr><td>DT Income + phí + điều chỉnh</td><td id="annualCalcIncome">0</td></tr><tr><td>Chênh quyết toán theo Income</td><td id="annualDiffIncome">0</td></tr><tr><td>HĐ hiệu lực + phí + điều chỉnh</td><td id="annualCalcInvoice">0</td></tr><tr><td>Chênh quyết toán theo HĐ</td><td id="annualDiffInvoice">0</td></tr></tbody></table></div></div>',
    '<div class="grid2 section"><div class="card"><h3>D. Tình trạng HĐ trong năm</h3><div id="annualStatusBox" class="formula">Chưa có dữ liệu.</div></div><div class="card"><h3>E. Rủi ro năm & phương án xử lý</h3><div id="annualRiskBox" class="tablewrap"><table><thead><tr><th>Mã</th><th>Mức</th><th>Số đơn</th><th>Rủi ro</th><th>Phương án</th></tr></thead><tbody id="annualRiskRows"></tbody></table></div></div></div>',
    '<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Các kỳ đã lưu</h2></div><div class="tablewrap"><table><thead><tr><th>Công ty</th><th>Sàn</th><th>Năm</th><th>Kỳ</th><th>Từ ngày</th><th>Đến ngày</th><th>Order ID</th><th>DT cần xuất</th><th>DT Income</th><th>Phí</th><th>Quyết toán</th><th>Lưu lúc</th><th>Thao tác</th></tr></thead><tbody id="annualPeriodRows"><tr><td colspan="13" class="muted">Chưa có dữ liệu.</td></tr></tbody></table></div><div class="note" style="margin-top:10px">Nếu các kỳ đã lưu có khoảng ngày chồng lấn, dữ liệu Income có thể bị cộng trùng. Nên mỗi kỳ dùng khoảng ngày không chồng lấn hoặc chạy lại đúng cùng tên kỳ để cập nhật kỳ cũ.</div></div>'
  ].join('');
}

window.renderAnnualSummary=async function(){
  const all=await fastGetAll('period_compact');
  const fake=all.map(p=>({id:p.id,company:p.company,companyKey:p.companyKey,year:p.year,marketplace:p.marketplace,period:p.period,from:p.from,to:p.to,note:p.note,savedAt:p.savedAt,summary:p.summary}));
  const arr=annualSelectedPeriods(fake);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=typeof v==='number'?moneyV(v):v};
  set('annualPeriods',arr.length);
  let annual=null;
  const csel=$('annualCompany')?.value||'',ysel=Number($('annualYear')?.value||0),mp=$('annualMarketplace')?.value||'';
  const hasRange=!!($('annualFrom')?.value||$('annualTo')?.value||t($('annualPeriodText')?.value));
  if(csel&&ysel&&mp&&!hasRange)annual=await fastGet('annual_light',[csel.toUpperCase(),mp,ysel].join('||'));
  if(!annual){
    const selectedIds=new Set(arr.map(x=>x.id)),periods=all.filter(x=>selectedIds.has(x.id));
    if(periods.length)annual=annualLightFromPeriods(periods,{company:periods[0].company,year:periods[0].year,marketplace:periods[0].marketplace});
  }
  const sm=annual?.summary||{},d=annual?.duplicateStats||{};
  set('annualOrders',d.uniqueOrders||0);set('annualRequired',sm.required||0);set('annualSettlement',sm.settlement||0);
  set('annualOrderOriginal',sm.revenueOriginal||0);set('annualOrderRefund',sm.refund||0);set('annualRequired2',sm.required||0);
  set('annualInvFirst',sm.invFirst||0);set('annualInvAdj',sm.invAdj||0);set('annualInvTotal',sm.invTotal||0);set('annualInvTotalDiff',sm.invTotalDiff||0);set('annualInvEffective',sm.invEffective||0);set('annualInvDiff',sm.invDiff||0);
  set('annualSellerNet',sm.sellerNet||0);set('annualBuyerShipping',sm.buyerShipping||0);set('annualIncomeRevenue',sm.incomeRevenue||0);set('annualTransactionFee',sm.transaction||0);set('annualCommission',sm.commission||0);set('annualProcessing',sm.processing||0);set('annualShippingNet',sm.shipping||0);set('annualAffiliate',sm.affiliate||0);set('annualPartner',sm.partner||0);set('annualAdjustment',sm.adjustment||0);set('annualFeeTotal',sm.feeTotal||0);
  set('annualSettlement2',sm.settlement||0);set('annualCalcIncome',sm.calcIncome||0);set('annualDiffIncome',sm.diffIncome||0);set('annualCalcInvoice',sm.calcInvoice||0);set('annualDiffInvoice',sm.diffInvoice||0);
  set('annualCrossPeriod',d.crossPeriodOrders||0);set('annualIncomeDup',d.duplicateIncomeEvents||0);set('annualInvoiceDup',d.duplicateInvoiceEvents||0);set('annualUniqueAfterDedupe',d.uniqueOrders||0);

  if($('annualStatusBox'))$('annualStatusBox').innerHTML=Object.entries(annual?.statusCounts||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc(k)+': <b>'+v.toLocaleString('vi-VN')+'</b>').join('<br>')||'Chưa có dữ liệu.';
  if($('annualRiskRows'))$('annualRiskRows').innerHTML=(annual?.risks||[]).sort((a,b)=>sev[b.level]-sev[a.level]||b.count-a.count).map(x=>'<tr><td>'+esc(x.code)+'</td><td><span class="badge '+riskBadge(x.level)+'">'+x.level+'</span></td><td>'+x.count.toLocaleString('vi-VN')+'</td><td>'+esc(x.reason)+'</td><td>'+esc(x.solution)+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">Chưa có dữ liệu.</td></tr>';

  const body=$('annualPeriodRows');
  if(body)body.innerHTML=arr.sort((a,b)=>(a.from||a.period||'').localeCompare(b.from||b.period||'')).map(x=>{
    const p=all.find(z=>z.id===x.id),ps=p?.summary||{};
    return '<tr><td>'+esc(x.company)+'</td><td>'+esc(x.marketplace)+'</td><td>'+esc(x.year)+'</td><td>'+esc(x.period)+'</td><td>'+esc(x.from||'')+'</td><td>'+esc(x.to||'')+'</td><td>'+n(ps.orderCount).toLocaleString('vi-VN')+'</td><td>'+moneyV(ps.required||0)+'</td><td>'+moneyV(ps.incomeRevenue||0)+'</td><td>'+moneyV(ps.feeTotal||0)+'</td><td>'+moneyV(ps.settlement||0)+'</td><td>'+esc((x.savedAt||'').replace('T',' ').slice(0,19))+'</td><td><button class="btn" onclick=\'loadStoredPeriod('+JSON.stringify(x.id)+')\'>Mở</button> <button class="btn danger" onclick=\'deleteStoredPeriod('+JSON.stringify(x.id)+')\'>Xóa</button></td></tr>';
  }).join('')||'<tr><td colspan="13" class="muted">Chưa có dữ liệu phù hợp bộ lọc.</td></tr>';
};



/* ===== V3.14 TRACE ORDER: dùng cùng logic đối soát doanh thu hiện hành ===== */
const __traceOrderLegacyV314 = typeof window.traceOrder==='function' ? window.traceOrder : null;
window.traceOrder=function(){
  const id=t(document.getElementById('traceOrderId')?.value);
  const box=document.getElementById('traceResult');
  if(!id){if(box)box.innerHTML='<div class="card section"><div class="muted">Vui lòng nhập Order ID.</div></div>';return;}
  const r=(liveResultState.rows||[]).find(x=>t(x.order_id)===id);
  if(!r){if(box)box.innerHTML='<div class="card section"><div class="bad badge">Không tìm thấy Order ID</div></div>';return;}
  enrich(r);
  const invItems=Array.isArray(r.invoice_items)?r.invoice_items:[];
  const sellerGoods=n(r.seller_revenue), sellerRefund=n(r.seller_refund), buyerShip=n(r.buyer_shipping_income), buyerShipRefund=n(r.buyer_shipping_refund);
  const incomeRevenueNow=incomeRevenue(r);
  const basis=r.v3_revenue_source||'ORDERS';
  const invoiceEffective=n(r.v3_invoice_effective);
  const diff=invoiceEffective-n(r.v3_revenue_current);
  const result=Math.abs(diff)<=tol()?'KHỚP':(diff>0?'DƯ HĐ':'THIẾU HĐ');

  box.innerHTML=
    '<div class="grid2 section">'+
      '<div class="card"><h3>Nguồn Đơn hàng</h3><div class="formula">'+
        'Order ID: <b>'+esc(r.order_id)+'</b><br>'+
        'Trạng thái: <b>'+esc(r.order_status||'')+'</b><br>'+
        'Ngày tạo: '+esc(r.created||'—')+'<br>'+
        'Ngày giao: '+esc(r.delivered||'—')+'<br>'+
        'Order Amount: <b>'+moneyV(r.order_amount||0)+'</b><br>'+
        'DT SKU: '+moneyV(r.sku_revenue||0)+'<br>'+
        'VC Orders: '+moneyV(r.order_shipping_buyer||0)+
      '</div></div>'+
      '<div class="card"><h3>Nguồn Income</h3><div class="formula">'+
        'Tổng phụ sau giảm giá người bán = <b>'+moneyV(sellerGoods)+'</b><br>'+
        'Hoàn tiền người bán = <b>'+moneyV(sellerRefund)+'</b><br>'+
        'Phí VC người mua = <b>'+moneyV(buyerShip)+'</b><br>'+
        'Hoàn phí VC người mua = <b>'+moneyV(buyerShipRefund)+'</b><br><br>'+
        '<b>Doanh thu Income đối soát = '+moneyV(incomeRevenueNow)+'</b><br>'+
        'Settlement = <b>'+moneyV(r.settlement||0)+'</b>'+
      '</div></div>'+
    '</div>'+
    '<div class="card section"><h3>Nguồn Hóa đơn</h3><div class="tablewrap"><table><thead><tr><th>Số HĐ</th><th>Ngày</th><th>Trạng thái</th><th>Giá trị</th></tr></thead><tbody>'+
      (invItems.map(i=>'<tr><td>'+esc(i.no||'')+'</td><td>'+esc(i.date||'')+'</td><td>'+esc(i.status||'')+'</td><td>'+moneyV(i.amount||0)+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">Không có dòng hóa đơn.</td></tr>')+
    '</tbody></table></div></div>'+
    '<div class="card section"><h3>App tính theo logic hiện hành</h3><div class="formula">'+
      'Nguồn doanh thu đối soát = <b>'+esc(basis)+'</b><br>'+
      (basis==='INCOME'?
        'Doanh thu cần xuất HĐ = seller_revenue + seller_refund + buyer_shipping_income + buyer_shipping_refund<br>'+
        '= '+moneyV(sellerGoods)+' + '+moneyV(sellerRefund)+' + '+moneyV(buyerShip)+' + '+moneyV(buyerShipRefund)+'<br>'
        :'Chưa có Income phù hợp → tạm dùng doanh thu Orders<br>')+
      '⇒ <b>Doanh thu cần xuất HĐ = '+moneyV(r.v3_revenue_current)+'</b><br><br>'+
      'HĐ hiệu lực = <b>'+moneyV(invoiceEffective)+'</b><br>'+
      'Chênh lệch HĐ = <b>'+moneyV(diff)+'</b><br>'+
      'Kết quả = <b>'+esc(result)+'</b>'+
    '</div></div>';
};

/* ===== DASHBOARD KPI DRILL-DOWN V3.7 ===== */
const KPI_DRILL_MAP={
  v3OrdOriginal:{label:'GT đơn gốc (Order Amount)',field:'v3_revenue_original',source:'revenue'},
  v3OrdRefund:{label:'Hoàn đơn',field:'v3_refund',source:'revenue'},
  v3OrdCurrent:{label:'Doanh thu phải xuất hiện tại',field:'v3_revenue_current',source:'revenue'},
  v3InvFirst:{label:'HĐ lần đầu',field:'v3_invoice_first',source:'revenue'},
  v3InvAdj:{label:'HĐ điều chỉnh',field:'v3_invoice_adjustment',source:'revenue'},
  v3InvTotal:{label:'Tổng HĐ = lần đầu + điều chỉnh',field:'v3_invoice_total_after_adjustment',source:'revenue'},
  v3InvTotalDiff:{label:'Chênh Tổng HĐ - DT cần xuất',field:'v3_invoice_total_diff',source:'revenue'},
  v3InvEffective:{label:'HĐ hiệu lực theo vòng đời',field:'v3_invoice_effective',source:'revenue'},
  v3InvDiff:{label:'Chênh HĐ hiệu lực',field:'v3_invoice_diff',source:'revenue'},
  v3IncomeGoods:{label:'DT hàng sau giảm',field:'v3_income_goods',source:'cost'},
  v3IncomeRefund:{label:'Hoàn hàng',field:'v3_income_goods_refund',source:'cost'},
  v3BuyerShipping:{label:'VC người mua',field:'v3_buyer_shipping',source:'cost'},
  v3BuyerShippingRefund:{label:'Hoàn VC người mua',field:'v3_buyer_shipping_refund',source:'cost'},
  v3IncRevenue:{label:'Doanh thu Income đối soát',field:'v3_income_revenue',source:'cost'},
  v3Transaction:{label:'Phí giao dịch',field:'transaction_fee',source:'cost'},
  v3Commission:{label:'Hoa hồng TikTok',field:'tiktok_commission',source:'cost'},
  v3Processing:{label:'Phí xử lý',field:'processing_fee',source:'cost'},
  v3Shipping:{label:'Vận chuyển thuần',field:'shipping_net',source:'cost'},
  v3Affiliate:{label:'Affiliate',field:'affiliate',source:'cost'},
  v3Partner:{label:'Đối tác',field:'partner',source:'cost'},
  v3Adjust:{label:'Điều chỉnh',field:'adjustment',source:'cost'},
  v3FeeTotal:{label:'Phí chi tiết đã map',field:'v3_fee_total',source:'cost'},
  v3FeeSource:{label:'Tổng phí nguồn Income',field:'v3_fee_source',source:'cost'},
  v3FeeUnmapped:{label:'Phí khác/chưa map',field:'v3_fee_unmapped',source:'cost'},
  v3Settlement:{label:'TikTok quyết toán',field:'settlement',source:'cost'},
  v3CalcIncome:{label:'DT Income + phí + ĐC',field:'v3_settlement_calc_income',source:'cost'},
  v3DiffIncome:{label:'Chênh QT phí chi tiết',field:'v3_settlement_diff_income',source:'cost'},
  v3CalcBest:{label:'QT chuẩn theo Tổng phí nguồn',field:'v3_settlement_calc_best',source:'cost'},
  v3DiffBest:{label:'Chênh QT chuẩn',field:'v3_settlement_diff_best',source:'cost'},
  v3CalcInvoice:{label:'HĐ đã xuất + phí + ĐC',field:'v3_settlement_calc_invoice',source:'cost'},
  v3DiffInvoice:{label:'Chênh QT theo HĐ',field:'v3_settlement_diff_invoice',source:'cost'},
  v3High:{label:'Rủi ro cao',risk:'CAO',source:'all'},
  v3Med:{label:'Rủi ro trung bình',risk:'TRUNG BÌNH',source:'all'},
  v3Low:{label:'Rủi ro thấp',risk:'THẤP',source:'all'}
};
let KPI_DETAIL_ROWS=[],KPI_DETAIL_FILTERED=[],KPI_DETAIL_PAGE=1;
const KPI_DETAIL_PAGE_SIZE=100;

function ensureKpiDetailModal(){
  if($('kpiDetailModal'))return;
  const box=document.createElement('div');
  box.id='kpiDetailModal';
  box.style.cssText='display:none;position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:9999;padding:4vh 3vw;';
  box.innerHTML='<div style="background:#fff;border-radius:16px;max-width:1400px;margin:auto;height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,.25)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #eee">'+
      '<div><h2 id="kpiDetailTitle" style="margin:0">Chi tiết chỉ tiêu</h2><div id="kpiDetailSummary" class="muted"></div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="exportKpiDetail()">Xuất Excel</button><button class="btn" onclick="closeKpiDetail()">Đóng</button></div>'+
    '</div>'+
    '<div style="padding:10px 16px"><input id="kpiDetailSearch" placeholder="Tìm Order ID / số HĐ / trạng thái..." oninput="filterKpiDetail()" style="max-width:420px"></div>'+
    '<div class="tablewrap" style="margin:0 16px;max-height:none;flex:1"><table><thead><tr><th>Order ID</th><th>Ngày đơn</th><th>Ngày giao</th><th>Ngày QT</th><th>Số HĐ</th><th>Trạng thái HĐ</th><th>Giá trị đóng góp</th><th>Mức RR</th><th>Rủi ro / trạng thái</th></tr></thead><tbody id="kpiDetailBody"></tbody></table></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px"><span id="kpiDetailCount" class="muted"></span><div><button class="btn" onclick="kpiDetailPrev()">← Trước</button> <span id="kpiDetailPage" class="muted"></span> <button class="btn" onclick="kpiDetailNext()">Sau →</button></div></div>'+
  '</div>';
  box.addEventListener('click',e=>{if(e.target===box)closeKpiDetail()});
  document.body.appendChild(box);
}
function detailRowsForMetric(cfg){
  enrichRows();
  let rows=(liveResultState.rows||[]);
  if(cfg.source==='revenue')rows=rows.filter(r=>r.order_source_present&&delivered(r)&&inPeriod(r.delivered));
  else if(cfg.source==='cost')rows=rows.filter(r=>r.income_source_present);
  if(cfg.risk)rows=rows.filter(r=>r.risk_level===cfg.risk);
  return rows.map(r=>({
    order_id:t(r.order_id),created:t(r.created||r.income_order_date),delivered:t(r.delivered),settlement_date:t(r.settlement_date),
    invoice_no:t(r.invoice_no),invoice_status:t(r.invoice_statuses||r.v3_invoice_state),
    value:cfg.field?n(r[cfg.field]):1,risk:t(r.risk_level),note:t(r.risk_reason||r.v3_invoice_state||r.result)
  })).filter(x=>cfg.risk||abs(x.value)>tol());
}
window.openKpiDetail=function(id){
  const cfg=KPI_DRILL_MAP[id];if(!cfg)return;
  ensureKpiDetailModal();
  KPI_DETAIL_ROWS=detailRowsForMetric(cfg);KPI_DETAIL_FILTERED=KPI_DETAIL_ROWS;KPI_DETAIL_PAGE=1;
  $('kpiDetailTitle').textContent='Chi tiết · '+cfg.label;
  $('kpiDetailSearch').value='';
  $('kpiDetailModal').style.display='block';
  renderKpiDetail();
};
window.closeKpiDetail=function(){if($('kpiDetailModal'))$('kpiDetailModal').style.display='none'};
window.filterKpiDetail=function(){
  const q=t($('kpiDetailSearch')?.value).toLowerCase();
  KPI_DETAIL_FILTERED=KPI_DETAIL_ROWS.filter(x=>!q||[x.order_id,x.invoice_no,x.invoice_status,x.risk,x.note].some(v=>t(v).toLowerCase().includes(q)));
  KPI_DETAIL_PAGE=1;renderKpiDetail();
};
function renderKpiDetail(){
  const totalPages=Math.max(1,Math.ceil(KPI_DETAIL_FILTERED.length/KPI_DETAIL_PAGE_SIZE));
  KPI_DETAIL_PAGE=Math.min(Math.max(1,KPI_DETAIL_PAGE),totalPages);
  const page=KPI_DETAIL_FILTERED.slice((KPI_DETAIL_PAGE-1)*KPI_DETAIL_PAGE_SIZE,KPI_DETAIL_PAGE*KPI_DETAIL_PAGE_SIZE);
  if($('kpiDetailBody'))$('kpiDetailBody').innerHTML=page.map(x=>'<tr>'+
    '<td><b>'+esc(x.order_id)+'</b></td><td>'+esc(x.created)+'</td><td>'+esc(x.delivered)+'</td><td>'+esc(x.settlement_date)+'</td>'+
    '<td>'+esc(x.invoice_no)+'</td><td>'+esc(x.invoice_status)+'</td><td>'+moneyV(x.value)+'</td>'+
    '<td><span class="badge '+riskBadge(x.risk)+'">'+esc(x.risk)+'</span></td><td>'+esc(x.note)+'</td></tr>').join('')||
    '<tr><td colspan="9" class="muted">Không có dòng chi tiết.</td></tr>';
  const total=KPI_DETAIL_FILTERED.reduce((a,x)=>a+n(x.value),0);
  if($('kpiDetailSummary'))$('kpiDetailSummary').textContent=KPI_DETAIL_FILTERED.length.toLocaleString('vi-VN')+' dòng · Tổng giá trị: '+moneyV(total);
  if($('kpiDetailCount'))$('kpiDetailCount').textContent=KPI_DETAIL_FILTERED.length.toLocaleString('vi-VN')+' dòng';
  if($('kpiDetailPage'))$('kpiDetailPage').textContent='Trang '+KPI_DETAIL_PAGE+'/'+totalPages;
}
window.kpiDetailPrev=function(){KPI_DETAIL_PAGE=Math.max(1,KPI_DETAIL_PAGE-1);renderKpiDetail()};
window.kpiDetailNext=function(){const mx=Math.max(1,Math.ceil(KPI_DETAIL_FILTERED.length/KPI_DETAIL_PAGE_SIZE));KPI_DETAIL_PAGE=Math.min(mx,KPI_DETAIL_PAGE+1);renderKpiDetail()};
window.exportKpiDetail=function(){objectRowsToXlsx(KPI_DETAIL_FILTERED,'CHI_TIET_CHI_TIEU_TONG_QUAN.xlsx','Chi tiet',true)};

function bindDashboardKpiDrill(){
  ensureKpiDetailModal();
  for(const id of Object.keys(KPI_DRILL_MAP)){
    const b=$(id);if(!b)continue;
    const card=b.closest('.kpi');if(!card||card.dataset.drillBound)return;
    card.dataset.drillBound='1';card.style.cursor='pointer';card.title='Bấm để xem chi tiết';
    card.addEventListener('click',()=>openKpiDetail(id));
    const hint=document.createElement('div');hint.textContent='Xem chi tiết ›';hint.style.cssText='font-size:11px;margin-top:5px;opacity:.68';
    card.appendChild(hint);
  }
}

document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{installAnnualV34();install();refreshAnnualSelectors?.().then(()=>renderAnnualSummary()).catch(()=>{});bindDashboardKpiDrill()},350));
window.addEventListener('load',()=>setTimeout(()=>{enrichRows();renderDashboard();renderRevenue();renderCost()},1400));
document.addEventListener('click',e=>{const b=e.target.closest?.('.navbtn');if(!b)return;const p=b.dataset?.page;setTimeout(()=>{if(p==='dashboard')renderDashboard();else if(p==='invoice')renderRevenue();else if(p==='fees')renderCost();else if(p==='annual')renderAnnualSummary();},80)});
if(typeof loadAnnualIntoViews==='function'){const old=loadAnnualIntoViews;window.loadAnnualIntoViews=function(a){const z=old(a);setTimeout(()=>{enrichRows();renderDashboard();renderRevenue();renderCost()},60);return z}}

window.loadStoredPeriod=async function(id){
  const x=await dbGetPeriodDirect(id);if(!x)return;
  const v=(id,val)=>{const e=$(id);if(e)e.value=val||''};
  v('companyName',x.company);v('dataYear',x.year);v('periodName',x.period);v('fromDate',x.from);v('toDate',x.to);v('periodNote',x.note);v('marketplaceSelect',x.marketplace);
  window.__CURRENT_PERIOD_ROWS=x.rows||[];liveResultState.rows=x.rows||[];liveResultState.invoiceRows=liveResultState.rows;liveResultState.feesRows=liveResultState.rows;
  enrichRows();renderDashboard();renderRevenue();renderCost();document.querySelector('[data-page="dashboard"]')?.click();
};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>ensureCompactMigrationV36().then(()=>refreshAnnualSelectors()).catch(console.error),1800));
})();