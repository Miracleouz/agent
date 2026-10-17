import puppeteer from 'puppeteer';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,userDataDir:'/app/data/whatsapp/session',args:['--no-sandbox','--disable-dev-shm-usage']});
console.log('owned-browser-ready');
const close=async()=>{await browser.close();process.exit(0);};
process.stdin.once('end',close);process.stdin.resume();process.on('SIGTERM',close);
