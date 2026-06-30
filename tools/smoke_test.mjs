import { chromium } from 'playwright-core';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env.GAME_URL || 'http://localhost:8000/index.html';
const SHOT = './_smoke_shots/';
import { mkdirSync } from 'fs'; mkdirSync(SHOT,{recursive:true});

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type()==='error' && !m.text().includes('favicon')) errors.push('CONSOLE: '+m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await (await page.$('#btn-start'))?.click();
await page.waitForTimeout(800);

// Set up a combat scene: face a horde spawned just in front of the player.
await page.evaluate(() => {
  const g = window.GAME, c = g.ctx;
  c.player.pos.set(0, 0, 0); c.player.yaw = 0; c.player.pitch = -0.04;  // face -Z
  for (let i = 0; i < 7; i++) c.zombies.spawn('walker', (Math.random()-0.5)*10, -10 - Math.random()*8);
  for (let i = 0; i < 3; i++) c.zombies.spawn('sprinter', (Math.random()-0.5)*8, -9 - Math.random()*6);
  c.zombies.spawn('tank', 3, -13);
  c.nav.computeField(0,0);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: SHOT+'shot_combat.png' });

await page.evaluate(() => { const w=window.GAME.ctx.weapons; for(let i=0;i<3;i++) w._fire(); });
await page.waitForTimeout(120);
await page.screenshot({ path: SHOT+'shot_fire.png' });

await page.evaluate(() => window.GAME.ctx.weapons._equip(2,true));
await page.waitForTimeout(200);
await page.screenshot({ path: SHOT+'shot_rifle.png' });

const mid = await page.evaluate(() => { const c=window.GAME.ctx; return {
  zombies:c.zombies.active.length, kills:c.score.kills, acc:c.score.accuracy().toFixed(1),
  shotsFired:c.score.shotsFired, shotsHit:c.score.shotsHit, health:Math.round(c.player.health) }; });
console.log('MID:', JSON.stringify(mid));

const vic = await page.evaluate(() => { const g=window.GAME; g.dev.setKills(249999); g.dev.addKills(1);
  return { kills:g.ctx.score.kills, won:g.ctx.score.won, state:g.ctx.gameState.state }; });
console.log('VICTORY:', JSON.stringify(vic));
await page.waitForTimeout(400);
await page.screenshot({ path: SHOT+'shot_victory.png' });

console.log('\nERRORS:', errors.length ? '\n'+errors.join('\n') : '(none)');
await browser.close();
