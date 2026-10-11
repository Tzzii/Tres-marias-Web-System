import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { pool, closePool } from '../src/db.js';
import { createReservation } from '../src/modules/reservations/reservations.service.js';
import * as repo from '../src/modules/reservations/reservations.repo.js';
import { themeColorSchemes } from '@tm/shared/src/domain/themeColors.js';

test('real booking service validates and persists new options; all fixtures roll back', async (t) => {
 assert.ok(['127.0.0.1','localhost','::1'].includes(config.db.host) && config.env !== 'production');
 const conn = await pool.getConnection();
 const id = `qa-${randomUUID()}`;
 try {
  await conn.beginTransaction();
  await conn.query('INSERT INTO customers (id, first_name, last_name, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',[id,'Booking','QA','Booking QA',`${id}@example.invalid`,'test-only-disabled-hash',Date.now()]);
  const [packages] = await conn.query("SELECT id FROM packages WHERE kind = 'package' AND visible = 1 AND archived = 0 ORDER BY sort_order LIMIT 1");
  const [[dessert]] = await conn.query("SELECT price FROM addons WHERE id = 'add-dessert'");
  const form = { packageId:packages[0].id, eventName:'QA booking options', occasion:'Birthday', date:'2090-02-21', startTime:'12:00', endTime:'15:00', guests:100, serviceType:'Buffet and Catering', agreeTerms:true, venueName:'QA venue', venueAddress:'QA street', city:'Malvar', addonIds:['add-dessert'], menu:{pork:['Lechon Kawali','Kare-Kare'], chicken:['Inasal'], fish:[], vegetable:['Laing'],juice:'Pineapple',dessert:{name:'Leche Flan',description:'Individual portions'}}, styling:{theme:'Royal',colors:themeColorSchemes('Royal')[0].colors} };
  const transact = (fn) => fn(conn);
  await t.test('three dishes rejected on the menu total field',async()=>{await assert.rejects(createReservation({id,name:'QA'}, {...form,menu:{...form.menu,pork:['Adobo']}},{transact}),e=>e.code==='INVALID' && e.meta?.field==='menu.total');});
  await t.test('dessert choice required when selected as an add-on',async()=>{await assert.rejects(createReservation({id,name:'QA'},{...form,menu:{...form.menu,dessert:{name:''}}},{transact}),e=>e.code==='INVALID' && e.meta?.field==='menu.dessert.name');});
  await t.test('two pork dishes, no fish, juice, dessert and recommended metallic motif round trip',async()=>{
   const saved = await createReservation({id,name:'Booking QA'},form,{transact});
   const [row] = await repo.findReservations(conn,{ref:saved.ref});
   assert.deepEqual(row.reservation.menu,form.menu);
   assert.deepEqual(row.reservation.styling.colors,form.styling.colors);
   assert.deepEqual(row.reservation.addonIds,['add-dessert']);
   assert.equal(row.reservation.estimate.addonTotals['add-dessert'],dessert.price || 0);
  });
  await t.test('catering only still saves dessert separately without buffet dishes',async()=>{
   const saved = await createReservation({id,name:'Booking QA'},{...form,serviceType:'Catering only'},{transact});
   const [row] = await repo.findReservations(conn,{ref:saved.ref});
   assert.deepEqual(row.reservation.menu,{dessert:form.menu.dessert});
   assert.deepEqual(row.reservation.addonIds,['add-dessert']);
  });
 } finally { await conn.rollback(); conn.release(); await closePool(); }
});
