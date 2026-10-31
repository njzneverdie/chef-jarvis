import test from 'node:test';import assert from 'node:assert/strict';
import {energyKcal,nutrientValue} from '../supabase/functions/_shared/usda-nutrients.js';
test('Foundation Atwater energy is read without inventing a macro-based estimate',()=>{
 assert.equal(energyKcal([{nutrientId:2048,nutrientName:'Energy (Atwater Specific Factors)',unitName:'KCAL',value:106}]),106);
 assert.equal(energyKcal([{nutrientId:2047,unitName:'KCAL',value:110},{nutrientId:2048,unitName:'KCAL',value:106}]),106);
 assert.equal(energyKcal([{nutrientNumber:'208',nutrientName:'Energy',unitName:'kcal',value:120}]),120);
 assert.equal(energyKcal([{nutrientId:2048,unitName:'kJ',value:444}]),null);
 assert.equal(energyKcal([]),null);
});
test('missing and invalid nutrient values remain unknown while true zero remains zero',()=>{
 assert.equal(nutrientValue([{nutrientName:'Protein',value:0}],['Protein']),0);
 for(const value of [null,undefined,NaN,-1,Infinity,'12'])assert.equal(nutrientValue([{nutrientName:'Protein',value}],['Protein']),null);
});
