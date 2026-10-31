export function nutrientValue(nutrients,names){
 const item=(Array.isArray(nutrients)?nutrients:[]).find(n=>names.includes(String(n.nutrientName||n.nutrient?.name))&&typeof n.value==='number'&&Number.isFinite(n.value)&&n.value>=0);
 return item?Math.round(item.value*10)/10:null;
}
export function energyKcal(nutrients){
 const values=(Array.isArray(nutrients)?nutrients:[]).filter(n=>String(n.unitName||n.nutrient?.unitName).toLowerCase()==='kcal'&&typeof n.value==='number'&&Number.isFinite(n.value)&&n.value>=0);
 for(const id of [2048,2047,1008]){
  const value=values.find(n=>Number(n.nutrientId??n.nutrient?.id)===id);
  if(value)return Math.round(value.value*10)/10;
 }
 const legacy=values.find(n=>String(n.nutrientNumber)==='208'||String(n.nutrientName||n.nutrient?.name)==='Energy');
 return legacy?Math.round(legacy.value*10)/10:null;
}
