// Headless checks for /summon's entity data (node tests/commands/summon.mjs).
import { loadModules } from '../../scripts/load.mjs';
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 120000).unref();
const { mods, close } = await loadModules(['/src/world/blocks.ts', '/src/item/item.ts', '/src/game/level.ts', '/src/world/world.ts', '/src/game/spawner.ts', '/src/game/commands.ts']);
const [, , levelMod, worldMod, spawner, commands] = mods;
let fails = 0;
const check = (name, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const level = new levelMod.Level(new worldMod.World(), 'test');

const d = commands.snbtScalars(`{Variant:2,CollarColor:14b, variant:"minecraft:black",Sheared:1b,Age:-24000,ArmorItems:[{},{id:"x",Count:1b}],CustomName:'{"text":"Bob, \\'the\\' parrot"}',Health:5.5f,Tame:true,"Quoted Key":'x'}`);
check('the plain values at the top: numbers, strings, true', d.Variant === 2 && d.CollarColor === 14 && d.variant === 'minecraft:black' && d.Sheared === 1 && d.Age === -24000 && d.Health === 5.5 && d.Tame === true && d['Quoted Key'] === 'x', JSON.stringify(d));
check('lists and compounds passed over, a quoted name kept whole', !('ArmorItems' in d) && d.CustomName === `{"text":"Bob, 'the' parrot"}`);
check('not a compound: nothing', Object.keys(commands.snbtScalars('~ ~ ~')).length === 0);

const summon = (type, nbt) => { const m = spawner.createMob(type, level); m.readSummonData(commands.snbtScalars(nbt)); return m; };
check('a parrot of the colour asked for', summon('parrot', '{Variant:3}').variant === 3);
const sheep = summon('sheep', '{Color:14b,Sheared:1b}');
check("a sheep's Color and Sheared (our color and sheared, as their kinds)", sheep.color === 14 && sheep.sheared === true, `${sheep.color} ${sheep.sheared}`);
check('a cat named by its "minecraft:" variant', summon('cat', '{variant:"minecraft:jellie"}').variant === 'jellie');
const horse = summon('horse', `{Variant:${3 | (2 << 8)}}`);
check("a horse's colour and markings", horse.color === 'brown' && horse.markings === 'white_field', `${horse.color} ${horse.markings}`);
check('a baby, from Age', summon('cow', '{Age:-24000}').isBaby() && !summon('cow', '{}').isBaby());
check('what it isn\'t given stays as it was', summon('parrot', '{Age:5}').variant === 0);

console.log(fails ? `${fails} FAILED` : 'all ok');
await close();
process.exit(fails ? 1 : 0);
