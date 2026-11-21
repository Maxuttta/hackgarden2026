const {spawnSync}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const adb=path.resolve(__dirname,'../mobile/.toolchain/platform-tools/adb.exe');
const port=8787;
function execute(args,input){
 const result=spawnSync(adb,args,{encoding:'utf8',windowsHide:true,timeout:20000,...(input?{input}:{})});
 if(result.error)throw Error('Не удалось запустить ADB: '+result.error.message);
 if(result.status!==0)throw Error((result.stderr||result.stdout||'Ошибка ADB').trim());
 return result.stdout.trim();
}
async function main(){
 if(!fs.existsSync(adb))throw Error('Android Platform Tools отсутствуют в mobile/.toolchain/platform-tools. Установите официальные Platform Tools в этот каталог.');
 const health=await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(4000)}).catch(()=>null);
 if(!health?.ok)throw Error('Локальный сервер остановлен. Выполните npm start из server/ и повторите подключение USB.');
 const devices=execute(['devices','-l']).split(/\r?\n/).slice(1).map(line=>{const parts=line.trim().split(/\s+/);return {serial:parts[0],state:parts[1],detail:line};}).filter(d=>d.serial);
 const requested=process.argv[2];
 const selected=devices.filter(d=>requested?d.serial===requested:!d.serial.includes(':')&&!d.serial.startsWith('emulator-'));
 if(!selected.length)throw Error('USB-телефон не обнаружен. Подключите кабель с передачей данных, разблокируйте телефон и включите отладку по USB.');
 if(selected.length>1)throw Error('Подключено несколько устройств. Укажите серийный номер аргументом команды.');
 const device=selected[0];
 if(device.state==='unauthorized')throw Error('Разблокируйте телефон и подтвердите «Разрешить отладку по USB» для этого компьютера, затем повторите команду.');
 if(device.state!=='device')throw Error('Устройство недоступно: '+device.state+'. Переподключите USB-кабель.');
 execute(['-s',device.serial,'reverse',`tcp:${port}`,`tcp:${port}`]);
 const tunnels=execute(['-s',device.serial,'reverse','--list']);
 if(!tunnels.includes(`tcp:${port} tcp:${port}`))throw Error('USB-перенаправление не подтвердилось');
 // Keep stdin open briefly: toybox nc can exit at EOF before reading the reply.
 // The command is built solely from the fixed local port, never from credentials.
 const check=`{ printf 'GET /health HTTP/1.1\\r\\nHost: 127.0.0.1:${port}\\r\\nConnection: close\\r\\n\\r\\n'; sleep 1; } | toybox nc -w 5 127.0.0.1 ${port}`;
 const response=execute(['-s',device.serial,'shell',check]);
 if(!response.includes('200 OK')||!response.includes('"ok":true'))throw Error('USB-туннель создан, но проверка /health с телефона не прошла.');
 console.log('Проверено с Android: локальный сервер отвечает через USB.');
 console.log(`Адрес в приложении: http://127.0.0.1:${port}`);
 console.log('Кабель должен оставаться подключённым. После переподключения повторите эту команду.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
