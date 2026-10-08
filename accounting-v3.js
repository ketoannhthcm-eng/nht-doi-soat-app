/* NHT Accounting Reconciliation V3.4 - 2026-10-08 */
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
  let original=n(r.order_amount);
  if(abs(original)<=tol()) original=n(r.sku_revenue)+n(r.order_shipping_buyer);
  if(abs(original)<=tol() && r.order_source_present && !r.income_source_present && abs(r.required_invoice)>tol()) original=n(r.required_invoice);
  const refund=abs(r.order_refund_amount);
  const current=original-refund;
  const first=n(r.invoice_original_issued_amount||r.invoice_new_amount);
  const actualAdj=n(r.invoice_adjustment_amount);
  const effective=n(r.invoice_effective_amount||r.invoice_active_net||r.invoice_amount_all);
  const expectedAdj=(n(r.invoice_count)>0)?current-first:0;
  return {original,refund,current,first,expectedAdj,actualAdj,effective,firstDiff:first-original,currentDiff:effective-current};
}
function incomeRevenue(r){return n(r.seller_net)+n(r.buyer_shipping_net)}
function feeDetailTotal(r){return n(r.transaction_fee)+n(r.tiktok_commission)+n(r.processing_fee)+n(r.shipping_net)+n(r.affiliate)+n(r.partner)}
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
    if(abs(r.v3_settlement_diff_income)>T)addRisk(rs,'QT01','CAO','Doanh thu theo Income + chi phí + điều chỉnh không khớp số TikTok quyết toán.','Truy vết từng khoản phí/điều chỉnh trong Income; kiểm tra thiếu dòng, trùng dòng hoặc cột chưa được map.');
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
  r.v3_invoice_first=d.first;r.v3_expected_adjustment=d.expectedAdj;r.v3_invoice_adjustment=d.actualAdj;r.v3_invoice_effective=d.effective;
  r.v3_invoice_total_after_adjustment=r.v3_invoice_first+r.v3_invoice_adjustment;
  r.v3_invoice_total_diff=r.v3_invoice_total_after_adjustment-r.v3_revenue_current;
  r.v3_invoice_total_check=Math.abs(r.v3_invoice_total_diff)<=tol()?'KHỚP':(r.v3_invoice_total_diff>0?'DƯ HĐ':'THIẾU HĐ');
  r.v3_invoice_diff=d.currentDiff;r.v3_invoice_state=invoiceState(r,d);
  r.v3_income_revenue=incomeRevenue(r);r.v3_fee_total=feeDetailTotal(r);
  r.v3_settlement_calc_income=r.v3_income_revenue+r.v3_fee_total+n(r.adjustment);
  r.v3_settlement_diff_income=n(r.settlement)-r.v3_settlement_calc_income;
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
let REV=[],COST=[];
function revFilter(){enrichRows();const s=t($('v3RevSearch')?.value).toLowerCase(),st=t($('v3RevStatus')?.value),risk=t($('v3RevRisk')?.value);REV=(liveResultState.rows||[]).filter(r=>r.order_source_present&&delivered(r)&&inPeriod(r.delivered)).filter(r=>(!s||t(r.order_id).toLowerCase().includes(s)||t(r.invoice_no).toLowerCase().includes(s))&&(!st||r.v3_invoice_state===st)&&(!risk||r.risk_level===risk))}
function costFilter(){enrichRows();const s=t($('v3CostSearch')?.value).toLowerCase(),risk=t($('v3CostRisk')?.value),diff=t($('v3CostDiff')?.value),T=tol();COST=(liveResultState.rows||[]).filter(r=>r.income_source_present).filter(r=>{const dIncome=abs(r.v3_invoice_income_diff)>T,dQtIncome=abs(r.v3_settlement_diff_income)>T,dQtInvoice=abs(r.v3_settlement_diff_invoice)>T;let okDiff=true;if(diff==='any')okDiff=dIncome||dQtIncome||dQtInvoice;else if(diff==='income')okDiff=dIncome;else if(diff==='qtIncome')okDiff=dQtIncome;else if(diff==='qtInvoice')okDiff=dQtInvoice;else if(diff==='none')okDiff=!dIncome&&!dQtIncome&&!dQtInvoice;return (!s||t(r.order_id).toLowerCase().includes(s))&&(!risk||r.risk_level===risk)&&okDiff})}
function renderDashboard(){
  enrichRows();const rows=liveResultState.rows||[],rev=rows.filter(r=>r.order_source_present&&delivered(r)&&inPeriod(r.delivered)),cost=rows.filter(r=>r.income_source_present);
  const s=(id,v)=>{if($(id))$(id).textContent=moneyV(v)};
  s('v3OrdOriginal',sum(rev,'v3_revenue_original'));s('v3OrdRefund',sum(rev,'v3_refund'));s('v3OrdCurrent',sum(rev,'v3_revenue_current'));
  s('v3InvFirst',sum(rev,'v3_invoice_first'));s('v3InvAdj',sum(rev,'v3_invoice_adjustment'));s('v3InvTotal',sum(rev,'v3_invoice_total_after_adjustment'));s('v3InvTotalDiff',sum(rev,'v3_invoice_total_diff'));s('v3InvEffective',sum(rev,'v3_invoice_effective'));s('v3InvDiff',sum(rev,'v3_invoice_diff'));
  s('v3IncRevenue',sum(cost,'v3_income_revenue'));s('v3Transaction',sum(cost,'transaction_fee'));s('v3Commission',sum(cost,'tiktok_commission'));s('v3Processing',sum(cost,'processing_fee'));s('v3Shipping',sum(cost,'shipping_net'));s('v3Affiliate',sum(cost,'affiliate'));s('v3Partner',sum(cost,'partner'));s('v3Adjust',sum(cost,'adjustment'));s('v3FeeTotal',sum(cost,'v3_fee_total'));
  s('v3Settlement',sum(cost,'settlement'));s('v3CalcIncome',sum(cost,'v3_settlement_calc_income'));s('v3DiffIncome',sum(cost,'v3_settlement_diff_income'));s('v3CalcInvoice',sum(cost,'v3_settlement_calc_invoice'));s('v3DiffInvoice',sum(cost,'v3_settlement_diff_invoice'));
  const high=rows.filter(r=>r.risk_level==='CAO').length,med=rows.filter(r=>r.risk_level==='TRUNG BÌNH').length,low=rows.filter(r=>r.risk_level==='THẤP').length;
  if($('v3High'))$('v3High').textContent=high.toLocaleString('vi-VN');if($('v3Med'))$('v3Med').textContent=med.toLocaleString('vi-VN');if($('v3Low'))$('v3Low').textContent=low.toLocaleString('vi-VN');
  const map=new Map();for(const r of rows){for(const x of(r.v3_risks||[])){if(!map.has(x.code))map.set(x.code,{...x,count:0});map.get(x.code).count++}}
  const arr=[...map.values()].sort((a,b)=>sev[b.level]-sev[a.level]||b.count-a.count);
  if($('v3RiskSummary'))$('v3RiskSummary').innerHTML=arr.map(x=>'<tr><td>'+esc(x.code)+'</td><td><span class="badge '+riskBadge(x.level)+'">'+x.level+'</span></td><td>'+x.count.toLocaleString('vi-VN')+'</td><td>'+esc(x.reason)+'</td><td>'+esc(x.solution)+'</td></tr>').join('');
}
function renderRevenue(){
  revFilter();const b=$('v3RevenueBody');if(!b)return;
  b.innerHTML=REV.map(r=>'<tr><td>'+esc(r.order_id)+'</td><td>'+esc(r.order_status)+'</td><td>'+esc(r.created)+'</td><td>'+esc(r.delivered)+'</td><td>'+moneyV(r.sku_revenue)+'</td><td>'+moneyV(r.order_shipping_buyer)+'</td><td>'+moneyV(r.v3_revenue_original)+'</td><td>'+moneyV(r.v3_refund)+'</td><td>'+moneyV(r.v3_revenue_current)+'</td><td>'+moneyV(r.v3_invoice_first)+'</td><td>'+moneyV(r.v3_expected_adjustment)+'</td><td>'+moneyV(r.v3_invoice_adjustment)+'</td><td>'+moneyV(r.v3_invoice_effective)+'</td><td>'+moneyV(r.v3_invoice_diff)+'</td><td>'+esc(r.v3_invoice_state)+'</td><td><span class="badge '+riskBadge(r.risk_level)+'">'+r.risk_level+'</span></td><td>'+esc(r.risk_reason)+'</td><td>'+esc(r.risk_solution)+'</td></tr>').join('');
  const states=[...new Set(REV.map(r=>r.v3_invoice_state))].sort(),sel=$('v3RevStatus');if(sel){const cur=sel.value;sel.innerHTML='<option value="">Tất cả trạng thái HĐ</option>'+states.map(x=>'<option>'+esc(x)+'</option>').join('');sel.value=cur}
  if($('v3RevCount'))$('v3RevCount').textContent=REV.length.toLocaleString('vi-VN')+' đơn đã giao thuộc kỳ';
}
function renderCost(){
  costFilter();const b=$('v3CostBody');if(!b)return;
  b.innerHTML=COST.map(r=>'<tr><td>'+esc(r.order_id)+'</td><td>'+esc(r.created||r.income_order_date)+'</td><td>'+esc(r.settlement_date)+'</td><td>'+moneyV(r.v3_income_revenue)+'</td><td>'+moneyV(r.v3_invoice_effective)+'</td><td>'+moneyV(r.v3_invoice_income_diff)+'</td><td>'+moneyV(r.transaction_fee)+'</td><td>'+moneyV(r.tiktok_commission)+'</td><td>'+moneyV(r.processing_fee)+'</td><td>'+moneyV(r.shipping_net)+'</td><td>'+moneyV(r.affiliate)+'</td><td>'+moneyV(r.partner)+'</td><td>'+moneyV(r.adjustment)+'</td><td>'+moneyV(r.v3_fee_total)+'</td><td>'+moneyV(r.settlement)+'</td><td>'+moneyV(r.v3_settlement_calc_income)+'</td><td>'+moneyV(r.v3_settlement_diff_income)+'</td><td>'+moneyV(r.v3_settlement_calc_invoice)+'</td><td>'+moneyV(r.v3_settlement_diff_invoice)+'</td><td>'+esc(r.order_month||'')+'</td><td>'+esc(r.settlement_month||'')+'</td><td>'+esc(r.source_state)+'</td><td><span class="badge '+riskBadge(r.risk_level)+'">'+r.risk_level+'</span></td><td>'+esc(r.risk_reason)+'</td><td>'+esc(r.risk_solution)+'</td></tr>').join('');
  if($('v3CostCount')){const df=t($('v3CostDiff')?.value);$('v3CostCount').textContent=COST.length.toLocaleString('vi-VN')+' Order ID trong Income'+(df?' · đang lọc chênh lệch':'');}
}
window.v3ApplyRevenue=renderRevenue;window.v3ApplyCost=renderCost;
window.v3ExportRevenue=()=>objectRowsToXlsx(REV,'DOI_CHIEU_DOANH_THU_V3.xlsx','Doanh thu',true);
window.v3ExportCost=()=>objectRowsToXlsx(COST,'DOI_CHIEU_INCOME_CHI_PHI_QUYET_TOAN_V3.xlsx','Income',true);

function install(){
 const notice=$('standaloneNotice');if(notice)notice.innerHTML='<b>Luồng 1:</b> Tất cả đơn hàng + HĐ = doanh thu/HĐ theo ngày giao. <b>Luồng 2:</b> Income = doanh thu TikTok dùng quyết toán + từng loại phí + điều chỉnh = tiền TikTok trả. Đơn Income khác tháng vẫn được giữ xuyên năm.';
 const dash=$('dashboard');if(dash)dash.innerHTML=[
 '<div class="card section"><h2>Tổng quan kiểm soát kế toán</h2><div class="muted">Hiển thị đầy đủ doanh thu đơn hàng, vòng đời hóa đơn, từng nhóm chi phí và phép kiểm tra tiền TikTok quyết toán.</div></div>',
 '<div class="card section"><h3>A. Doanh thu theo Tất cả đơn hàng & hóa đơn</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(150px,1fr))"><div class="card kpi"><span class="muted">GT đơn gốc (Order Amount)</span><b id="v3OrdOriginal">0</b></div><div class="card kpi"><span class="muted">Hoàn đơn</span><b id="v3OrdRefund">0</b></div><div class="card kpi"><span class="muted">Doanh thu phải xuất hiện tại</span><b id="v3OrdCurrent">0</b></div><div class="card kpi"><span class="muted">HĐ lần đầu</span><b id="v3InvFirst">0</b></div><div class="card kpi"><span class="muted">HĐ điều chỉnh</span><b id="v3InvAdj">0</b></div><div class="card kpi"><span class="muted">Tổng HĐ = lần đầu + điều chỉnh</span><b id="v3InvTotal">0</b></div><div class="card kpi"><span class="muted">Chênh Tổng HĐ - DT cần xuất</span><b id="v3InvTotalDiff">0</b></div><div class="card kpi"><span class="muted">HĐ hiệu lực theo vòng đời</span><b id="v3InvEffective">0</b></div><div class="card kpi"><span class="muted">Chênh HĐ hiệu lực</span><b id="v3InvDiff">0</b></div></div></div>',
 '<div class="card section"><h3>B. Income - doanh thu & từng loại chi phí</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(150px,1fr))"><div class="card kpi"><span class="muted">Doanh thu Income</span><b id="v3IncRevenue">0</b></div><div class="card kpi"><span class="muted">Phí giao dịch</span><b id="v3Transaction">0</b></div><div class="card kpi"><span class="muted">Hoa hồng TikTok</span><b id="v3Commission">0</b></div><div class="card kpi"><span class="muted">Phí xử lý</span><b id="v3Processing">0</b></div><div class="card kpi"><span class="muted">Vận chuyển thuần</span><b id="v3Shipping">0</b></div><div class="card kpi"><span class="muted">Affiliate</span><b id="v3Affiliate">0</b></div><div class="card kpi"><span class="muted">Đối tác</span><b id="v3Partner">0</b></div><div class="card kpi"><span class="muted">Điều chỉnh</span><b id="v3Adjust">0</b></div><div class="card kpi"><span class="muted">Tổng chi phí chi tiết</span><b id="v3FeeTotal">0</b></div></div></div>',
 '<div class="card section"><h3>C. Kiểm tra tiền TikTok quyết toán</h3><div class="kpis" style="grid-template-columns:repeat(5,minmax(150px,1fr))"><div class="card kpi"><span class="muted">TikTok quyết toán</span><b id="v3Settlement">0</b></div><div class="card kpi"><span class="muted">DT Income + phí + ĐC</span><b id="v3CalcIncome">0</b></div><div class="card kpi"><span class="muted">Chênh QT theo Income</span><b id="v3DiffIncome">0</b></div><div class="card kpi"><span class="muted">HĐ đã xuất + phí + ĐC</span><b id="v3CalcInvoice">0</b></div><div class="card kpi"><span class="muted">Chênh QT theo HĐ</span><b id="v3DiffInvoice">0</b></div></div><div class="note" style="margin-top:10px">Phí trong Income đang mang dấu âm. Vì vậy công thức là <b>Doanh thu + tổng phí (âm) + điều chỉnh = tiền quyết toán</b>.</div></div>',
 '<div class="card section"><h3>D. Ma trận rủi ro & phương án xử lý</h3><div class="kpis" style="grid-template-columns:repeat(3,minmax(150px,1fr));margin-bottom:10px"><div class="card kpi"><span class="muted">Rủi ro cao</span><b id="v3High">0</b></div><div class="card kpi"><span class="muted">Rủi ro trung bình</span><b id="v3Med">0</b></div><div class="card kpi"><span class="muted">Rủi ro thấp</span><b id="v3Low">0</b></div></div><div class="tablewrap"><table><thead><tr><th>Mã</th><th>Mức</th><th>Số dòng</th><th>Rủi ro cụ thể</th><th>Phương án xử lý</th></tr></thead><tbody id="v3RiskSummary"></tbody></table></div></div>'
 ].join('');
 const inv=$('invoice');if(inv)inv.innerHTML=[
 '<div class="card section"><h2>Đối chiếu doanh thu & hóa đơn</h2><div class="muted">Doanh thu gốc ưu tiên <b>Order Amount</b> của file Tất cả đơn hàng; hoàn đơn làm giảm nghĩa vụ hiện tại. Phép kiểm tra chính: <b>HĐ lần đầu + HĐ điều chỉnh = Doanh thu sàn cần xuất hiện tại</b>. Cột Kết quả Tổng HĐ sẽ báo KHỚP / DƯ HĐ / THIẾU HĐ.</div></div>',
 '<div class="card section"><div class="toolbar"><input id="v3RevSearch" placeholder="Order ID / số HĐ" oninput="v3ApplyRevenue()"><select id="v3RevStatus" onchange="v3ApplyRevenue()"><option value="">Tất cả trạng thái HĐ</option></select><select id="v3RevRisk" onchange="v3ApplyRevenue()"><option value="">Tất cả rủi ro</option><option>CAO</option><option>TRUNG BÌNH</option><option>THẤP</option></select><button class="btn primary" onclick="v3ExportRevenue()">Xuất Excel</button><span id="v3RevCount" class="muted"></span></div><div class="tablewrap"><table><thead><tr><th>Order ID</th><th>Trạng thái đơn</th><th>Ngày đơn</th><th>Ngày giao</th><th>DT SKU</th><th>VC Orders</th><th>GT đơn gốc</th><th>Hoàn đơn</th><th>DT phải xuất hiện tại</th><th>HĐ lần đầu</th><th>ĐC phải có</th><th>HĐ điều chỉnh</th><th>Tổng HĐ = lần đầu + ĐC</th><th>Chênh Tổng HĐ - DT cần xuất</th><th>KQ Tổng HĐ</th><th>HĐ hiệu lực</th><th>Chênh HĐ hiệu lực</th><th>Trạng thái HĐ</th><th>Mức RR</th><th>Rủi ro cụ thể</th><th>Phương án xử lý</th></tr></thead><tbody id="v3RevenueBody"></tbody></table></div></div>'
 ].join('');
 const fees=$('fees');if(fees)fees.innerHTML=[
 '<div class="card section"><h2>Income - doanh thu, chi phí & quyết toán TikTok</h2><div class="muted">Kiểm tra đồng thời: <b>(1) doanh thu Income có khớp HĐ đã xuất không</b>; <b>(2) doanh thu + từng loại phí + điều chỉnh có khớp tiền TikTok quyết toán không</b>. Income của đơn khác tháng không bị loại.</div></div>',
 '<div class="card section"><div class="toolbar"><input id="v3CostSearch" placeholder="Order ID" oninput="v3ApplyCost()"><select id="v3CostRisk" onchange="v3ApplyCost()"><option value="">Tất cả rủi ro</option><option>CAO</option><option>TRUNG BÌNH</option><option>THẤP</option></select><select id="v3CostDiff" onchange="v3ApplyCost()"><option value="">Tất cả chênh lệch</option><option value="any">Có chênh lệch</option><option value="income">Chênh DT HĐ - Income</option><option value="qtIncome">Chênh quyết toán theo Income</option><option value="qtInvoice">Chênh quyết toán theo HĐ</option><option value="none">Không chênh lệch</option></select><button class="btn primary" onclick="v3ExportCost()">Xuất Excel</button><span id="v3CostCount" class="muted"></span></div><div class="tablewrap"><table><thead><tr><th>Order ID</th><th>Ngày đơn</th><th>Ngày QT</th><th>DT Income</th><th>HĐ đã xuất</th><th>Chênh DT HĐ-Income</th><th>Phí GD</th><th>HH TikTok</th><th>Phí xử lý</th><th>VC thuần</th><th>Affiliate</th><th>Đối tác</th><th>Điều chỉnh</th><th>Tổng chi phí</th><th>TikTok QT</th><th>DT Income+phí+ĐC</th><th>Chênh QT Income</th><th>HĐ+phí+ĐC</th><th>Chênh QT theo HĐ</th><th>Tháng đơn</th><th>Tháng QT</th><th>Nguồn</th><th>Mức RR</th><th>Rủi ro cụ thể</th><th>Phương án xử lý</th></tr></thead><tbody id="v3CostBody"></tbody></table></div></div>'
 ].join('');
 renderDashboard();renderRevenue();renderCost();
}


/* ===== V3.4 TỔNG HỢP NĂM CHI TIẾT ===== */
function installAnnualV34(){
  const sec=$('annual'); if(!sec)return;
  sec.innerHTML=[
    '<div class="card section"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><h2>Tổng hợp năm - kiểm soát kế toán</h2><div class="muted">Tổng hợp theo dữ liệu đã lưu trong năm. Tách 3 lớp: Doanh thu & HĐ, Income & chi phí, Quyết toán TikTok. Các đơn Income khác tháng vẫn được giữ theo Order ID.</div></div><div><button class="btn" onclick="exportDatabaseBackup()">Sao lưu dữ liệu</button> <label class="btn" style="cursor:pointer">Khôi phục dữ liệu<input type="file" id="restoreDbFile" accept=".json" style="display:none" onchange="restoreDatabaseBackup(this.files[0])"></label></div></div></div>',
    '<div class="card section"><div class="grid3"><div><label class="muted">Công ty</label><select id="annualCompany" onchange="renderAnnualSummary()"><option value="">Chọn công ty</option></select></div><div><label class="muted">Năm</label><select id="annualYear" onchange="renderAnnualSummary()"><option value="">Chọn năm</option></select></div><div><label class="muted">Sàn</label><select id="annualMarketplace" onchange="renderAnnualSummary()"><option value="">Tất cả sàn</option><option value="tiktok">TikTok Shop</option><option value="shopee">Shopee</option><option value="custom">Sàn tùy chỉnh</option></select></div></div><div class="grid3" style="margin-top:10px"><div><label class="muted">Từ ngày</label><input id="annualFrom" type="date" onchange="renderAnnualSummary()"></div><div><label class="muted">Đến ngày</label><input id="annualTo" type="date" onchange="renderAnnualSummary()"></div><div><label class="muted">Tìm tên kỳ</label><input id="annualPeriodText" placeholder="Ví dụ: Tháng 9" oninput="renderAnnualSummary()"></div></div><div style="margin-top:10px"><button class="btn" onclick="clearAnnualFilters()">Xóa bộ lọc</button> <button class="btn primary" onclick="exportAnnualRows()">Xuất dữ liệu năm</button></div></div>',
    '<div class="kpis section" style="grid-template-columns:repeat(4,minmax(160px,1fr))"><div class="card kpi"><span class="muted">Số kỳ đã lưu</span><b id="annualPeriods">0</b></div><div class="card kpi"><span class="muted">Order ID duy nhất</span><b id="annualOrders">0</b></div><div class="card kpi"><span class="muted">Doanh thu phải xuất HĐ</span><b id="annualRequired">0</b></div><div class="card kpi"><span class="muted">TikTok quyết toán</span><b id="annualSettlement">0</b></div></div>',
    '<div class="card section"><h3>A. Doanh thu & vòng đời hóa đơn năm</h3><div class="tablewrap"><table><tbody><tr><td>Giá trị đơn gốc (Orders)</td><td id="annualOrderOriginal">0</td></tr><tr><td>Hoàn đơn</td><td id="annualOrderRefund">0</td></tr><tr><td><b>Doanh thu phải xuất hiện tại</b></td><td id="annualRequired2"><b>0</b></td></tr><tr><td>HĐ lần đầu</td><td id="annualInvFirst">0</td></tr><tr><td>HĐ điều chỉnh</td><td id="annualInvAdj">0</td></tr><tr><td><b>Tổng HĐ = lần đầu + điều chỉnh</b></td><td id="annualInvTotal"><b>0</b></td></tr><tr><td>Chênh Tổng HĐ - DT cần xuất</td><td id="annualInvTotalDiff">0</td></tr><tr><td>HĐ hiệu lực theo vòng đời</td><td id="annualInvEffective">0</td></tr><tr><td>Chênh HĐ hiệu lực</td><td id="annualInvDiff">0</td></tr></tbody></table></div></div>',
    '<div class="card section"><h3>B. Income - doanh thu & chi phí năm</h3><div class="tablewrap"><table><tbody><tr><td>Doanh thu hàng hóa sau hoàn</td><td id="annualSellerNet">0</td></tr><tr><td>VC người mua sau hoàn</td><td id="annualBuyerShipping">0</td></tr><tr><td><b>Doanh thu Income</b></td><td id="annualIncomeRevenue"><b>0</b></td></tr><tr><td>Phí giao dịch</td><td id="annualTransactionFee">0</td></tr><tr><td>Hoa hồng TikTok</td><td id="annualCommission">0</td></tr><tr><td>Phí xử lý đơn hàng</td><td id="annualProcessing">0</td></tr><tr><td>Vận chuyển thuần</td><td id="annualShippingNet">0</td></tr><tr><td>Affiliate</td><td id="annualAffiliate">0</td></tr><tr><td>Đối tác liên kết</td><td id="annualPartner">0</td></tr><tr><td>Điều chỉnh</td><td id="annualAdjustment">0</td></tr><tr><td><b>Tổng chi phí chi tiết</b></td><td id="annualFeeTotal"><b>0</b></td></tr></tbody></table></div></div>',
    '<div class="card section"><h3>C. Kiểm tra tiền quyết toán năm</h3><div class="tablewrap"><table><tbody><tr><td><b>TikTok quyết toán thực tế</b></td><td id="annualSettlement2"><b>0</b></td></tr><tr><td>DT Income + phí + điều chỉnh</td><td id="annualCalcIncome">0</td></tr><tr><td>Chênh quyết toán theo Income</td><td id="annualDiffIncome">0</td></tr><tr><td>HĐ hiệu lực + phí + điều chỉnh</td><td id="annualCalcInvoice">0</td></tr><tr><td>Chênh quyết toán theo HĐ</td><td id="annualDiffInvoice">0</td></tr></tbody></table></div></div>',
    '<div class="grid2 section"><div class="card"><h3>D. Tình trạng HĐ trong năm</h3><div id="annualStatusBox" class="formula">Chưa có dữ liệu.</div></div><div class="card"><h3>E. Rủi ro năm & phương án xử lý</h3><div id="annualRiskBox" class="tablewrap"><table><thead><tr><th>Mã</th><th>Mức</th><th>Số đơn</th><th>Rủi ro</th><th>Phương án</th></tr></thead><tbody id="annualRiskRows"></tbody></table></div></div></div>',
    '<div class="card section"><div style="display:flex;justify-content:space-between;align-items:center"><h2>Các kỳ đã lưu</h2></div><div class="tablewrap"><table><thead><tr><th>Công ty</th><th>Sàn</th><th>Năm</th><th>Kỳ</th><th>Từ ngày</th><th>Đến ngày</th><th>Order ID</th><th>DT cần xuất</th><th>DT Income</th><th>Phí</th><th>Quyết toán</th><th>Lưu lúc</th><th>Thao tác</th></tr></thead><tbody id="annualPeriodRows"><tr><td colspan="13" class="muted">Chưa có dữ liệu.</td></tr></tbody></table></div><div class="note" style="margin-top:10px">Nếu các kỳ đã lưu có khoảng ngày chồng lấn, dữ liệu Income có thể bị cộng trùng. Nên mỗi kỳ dùng khoảng ngày không chồng lấn hoặc chạy lại đúng cùng tên kỳ để cập nhật kỳ cũ.</div></div>'
  ].join('');
}

window.renderAnnualSummary=async function(){
  const all=await dbGetAllPeriods();
  const arr=annualSelectedPeriods(all);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=typeof v==='number'?moneyV(v):v};
  set('annualPeriods',arr.length);
  let rows=[];
  try{rows=typeof mergePeriodRows==='function'?mergePeriodRows(arr):arr.flatMap(x=>x.rows||[])}catch(e){rows=arr.flatMap(x=>x.rows||[])}
  rows=(rows||[]).map(r=>enrich(r));
  set('annualOrders',new Set(rows.map(r=>r.order_id).filter(Boolean)).size);
  set('annualRequired',sum(rows,'v3_revenue_current'));
  set('annualSettlement',sum(rows,'settlement'));
  set('annualOrderOriginal',sum(rows,'v3_revenue_original'));
  set('annualOrderRefund',sum(rows,'v3_refund'));
  set('annualRequired2',sum(rows,'v3_revenue_current'));
  set('annualInvFirst',sum(rows,'v3_invoice_first'));
  set('annualInvAdj',sum(rows,'v3_invoice_adjustment'));
  set('annualInvTotal',sum(rows,'v3_invoice_total_after_adjustment'));
  set('annualInvTotalDiff',sum(rows,'v3_invoice_total_diff'));
  set('annualInvEffective',sum(rows,'v3_invoice_effective'));
  set('annualInvDiff',sum(rows,'v3_invoice_diff'));
  set('annualSellerNet',sum(rows,'seller_net'));
  set('annualBuyerShipping',sum(rows,'buyer_shipping_net'));
  set('annualIncomeRevenue',sum(rows,'v3_income_revenue'));
  set('annualTransactionFee',sum(rows,'transaction_fee'));
  set('annualCommission',sum(rows,'tiktok_commission'));
  set('annualProcessing',sum(rows,'processing_fee'));
  set('annualShippingNet',sum(rows,'shipping_net'));
  set('annualAffiliate',sum(rows,'affiliate'));
  set('annualPartner',sum(rows,'partner'));
  set('annualAdjustment',sum(rows,'adjustment'));
  set('annualFeeTotal',sum(rows,'v3_fee_total'));
  set('annualSettlement2',sum(rows,'settlement'));
  set('annualCalcIncome',sum(rows,'v3_settlement_calc_income'));
  set('annualDiffIncome',sum(rows,'v3_settlement_diff_income'));
  set('annualCalcInvoice',sum(rows,'v3_settlement_calc_invoice'));
  set('annualDiffInvoice',sum(rows,'v3_settlement_diff_invoice'));

  const counts={};
  for(const r of rows){const k=r.v3_invoice_state||'KHÔNG XÁC ĐỊNH';counts[k]=(counts[k]||0)+1}
  if($('annualStatusBox'))$('annualStatusBox').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>esc(k)+': <b>'+v.toLocaleString('vi-VN')+'</b>').join('<br>')||'Chưa có dữ liệu.';

  const rm=new Map();
  for(const r of rows){for(const x of(r.v3_risks||[])){if(!rm.has(x.code))rm.set(x.code,{...x,count:0});rm.get(x.code).count++}}
  if($('annualRiskRows'))$('annualRiskRows').innerHTML=[...rm.values()].sort((a,b)=>sev[b.level]-sev[a.level]||b.count-a.count).map(x=>'<tr><td>'+esc(x.code)+'</td><td><span class="badge '+riskBadge(x.level)+'">'+x.level+'</span></td><td>'+x.count.toLocaleString('vi-VN')+'</td><td>'+esc(x.reason)+'</td><td>'+esc(x.solution)+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">Chưa có dữ liệu.</td></tr>';

  const body=$('annualPeriodRows');
  if(body)body.innerHTML=arr.sort((a,b)=>(a.from||a.period||'').localeCompare(b.from||b.period||'')).map(x=>{
    const rr=(x.rows||[]).map(r=>enrich({...r}));
    return '<tr><td>'+esc(x.company)+'</td><td>'+esc(x.marketplace)+'</td><td>'+esc(x.year)+'</td><td>'+esc(x.period)+'</td><td>'+esc(x.from||'')+'</td><td>'+esc(x.to||'')+'</td><td>'+new Set(rr.map(r=>r.order_id).filter(Boolean)).size.toLocaleString('vi-VN')+'</td><td>'+moneyV(sum(rr,'v3_revenue_current'))+'</td><td>'+moneyV(sum(rr,'v3_income_revenue'))+'</td><td>'+moneyV(sum(rr,'v3_fee_total'))+'</td><td>'+moneyV(sum(rr,'settlement'))+'</td><td>'+esc((x.savedAt||'').replace('T',' ').slice(0,19))+'</td><td><button class="btn" onclick=\'loadStoredPeriod('+JSON.stringify(x.id)+')\'>Mở</button> <button class="btn danger" onclick=\'deleteStoredPeriod('+JSON.stringify(x.id)+')\'>Xóa</button></td></tr>';
  }).join('')||'<tr><td colspan="13" class="muted">Chưa có dữ liệu phù hợp bộ lọc.</td></tr>';
};


document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{installAnnualV34();install();refreshAnnualSelectors?.().then(()=>renderAnnualSummary()).catch(()=>{})},350));
window.addEventListener('load',()=>setTimeout(()=>{enrichRows();renderDashboard();renderRevenue();renderCost()},1400));
document.addEventListener('click',e=>{const b=e.target.closest?.('.navbtn');if(!b)return;setTimeout(()=>{renderDashboard();renderRevenue();renderCost()},120)});
if(typeof loadAnnualIntoViews==='function'){const old=loadAnnualIntoViews;window.loadAnnualIntoViews=function(a){const z=old(a);setTimeout(()=>{enrichRows();renderDashboard();renderRevenue();renderCost()},60);return z}}
})();