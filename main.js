const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const fetch = require('node-fetch');
const sqlite3 = require("sqlite3").verbose();




 //&api_cle=apitel-g4aatlgif6qzf
const api_sign = "fcbeb0383a597f2ba732f622f4b3c90e667d492d", api_cle = "apitel-5304b49c90511"; //&api_signature=fcbeb0383a597f2ba732f622f4b3c90e667d492d&api_cle=apitel-5304b49c90511 "uIF59SZhfrfm5Gb");

const APIINIT = '/v1/application/initialisation', APIGRID = '/v3/programmes/grille'; //const prog  = '/v1/programmes/';
const URL  = 'https://api.telerama.fr',HEADER = {"cache-control": "max-age=0", 
                                                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.0.0 Safari/537.36",
                                                "sec-fetch-site": "none",
                                                "sec-fetch-mode": "navigate",
                                                "sec-fetch-dest": "document",
                                                "sec-fetch-user": "?1","upgrade-insecure-requests": "1"};
var DATA= {"init":"","prog":[]};

function getSignature(a) {
    var hmac = crypto.createHmac('sha1',"uIF59SZhfrfm5Gb");
    return hmac.update(a).digest("hex");
}

function buildURL(d,u,p,selfsign=true) {
    let params = {"appareil":"android_tablette",...p}, result="";
    if (selfsign) {
        let purl = new URLSearchParams(params);
        purl.sort();
        purl = decodeURIComponent(purl.toString());
        result = d + u + "?"+ purl + "&api_cle=apitel-g4aatlgif6qzf&api_signature=" + getSignature(u+purl.replace(/&|=/g,""));
    }
    else {
        params = {...params,"api_cle":api_cle,"api_signature":api_sign};
        let purl = new URLSearchParams(params).toString();
        result = d + u + "?" + purl;
    }
    console.log("Requesting "+result);
    return result;
}

var DB = null;
const db = () => {
    if (DB==null) {
        DB = new sqlite3.Database(':memory:',sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,(e)=>{if (e) console.error(e);});
        let sql_cre_emissions = "CREATE TABLE IF NOT EXISTS emissions (id_emission INTEGER PRIMARY KEY, startAt DATETIME, endAt DATETIME, name TEXT, desc TEXT, resume TEXT, is_inedit INTEGER, is_direct INTEGER, is_vm INTEGER, has_replay INTEGER, note_telerama INTEGER)";
        DB.serialize(()=>{
            DB.run(sql_cre_emissions,(e)=>{if (e) console.error(e);});
            DB.run("CREATE TABLE IF NOT EXISTS grid (id_chaine INTEGER, startAt DATETIME, endAt DATETIME, id_emission INTEGER, PRIMARY KEY (id_chaine,startAt,endAt));",(e)=>{if (e) console.error(e);});
        });
    }
    return DB;
}

function merge(web,stored) {
    var data = web.donnees;
    if (data.length>0) {
        let oldArr = (stored.length) ? stored.map(_=>{ return {"id_chaine": _.id_chaine,"date":_.startAt.getDate(),"heure_debut":_.startAt.split(" ")[1],"heure_fin":_.endAt.split(" ")[1]}; }) : [];
        
        data.forEach(r=>{
            db().serialize(()=>{
                let d = Date.parse(r.date+" "+r.horaire.debut), f= Date.parse(r.date+" "+r.horaire.fin);
                db().run("INSERT OR IGNORE INTO grid VALUES (?,?,?,?)",[r.id_chaine,d,f,r.id_emission],(e)=>{
                    if (e) console.debug("Error on insert : INSERT OR IGNORE INTO grid VALUES (?,?,?,?) ["+[r.id_chaine,parseInt(d),parseInt(f),r.id_emission]+"] "+ e);
                });
            });
        });  
        //db().exec("commit;");
        db().each("select count(*) from grid",(e,r)=>{if(e) console.debug(e); console.debug(r);})
        
        data = [...data,oldArr];
    }
    web.donnees=data;
    return web;
}

function retrieve(apiGrid,p,evt) {
    db().serialize(()=>{ 
        db().all("SELECT * FROM grid WHERE startAt BETWEEN ? AND ? AND id_chaine NOT IN (?)",[Date.parse(p.date+" "+p.heure_debut),Date.parse(p.date+" "+p.heure_fin),p.id_chaines],(err,arr)=>{
            console.debug("SELECT * FROM grid WHERE startAt BETWEEN ? AND ? AND id_chaine NOT IN (?)",[Date.parse(p.date+" "+p.heure_debut),Date.parse(p.date+" "+p.heure_fin),p.id_chaines]);
            if (err) console.error("Error on Grid Select",err);
            //console.debug(p.id_chaines); //console.debug(arr.map(_=>_.id_chaine).join("/"));
            if (arr.length>0) p.id_chaines = p.id_chaines.split(",").filter(x=> !arr.map(_=>_.id_chaine).filter((v,i,s)=>s.indexOf(i)===v).includes(x));
            if (p.id_chaines.length>0) 
                fetch(buildURL(URL,apiGrid,p,true),{"compress":true,"headers":HEADER}).then(res =>res.json()).then(_ => evt.reply("init_grid",merge(_,arr)) );
            else 
                evt.reply("init_grid",merge(_,arr));

        });
    });
    
}

function getGrid(e,args={}) {
    var p={};
    let chaines = DATA.init.donnees.bouquets.filter(_=>_.nom=="TNT")[0].chaines.join(",");
    if (Object.keys(args).length) {
        let {argChn,date,debut,fin}=args;
        let chn = (argChn) ? argChn : chaines;
        if (!debut) { debut='16:00'; fin="23:59"; }
        p = { 'date' : date, 'id_chaines': chn, "heure_debut":debut,"heure_fin":fin, 'nb_par_page' : 3200, 'page' : 1 }; 
    }
    else
        p = { 'date' : "2020-10-15", 'id_chaines': chaines, "heure_debut" : '16:00', "heure_fin" : '23:59', "nb_par_page" : 600, "page" : 1 };
    
    retrieve(APIGRID,p,e);
}

function init(e) {
    fetch(buildURL(URL,APIINIT,"",true),{"compress":true,"headers":HEADER}).then(res =>res.json())
    .then(_=> {DATA.init=_; e.reply("init",_);});//.then(_=> getGrid(e)); //{"chaines":192,"date":"2020-10-14"}
}

function disp() {
    let win = new BrowserWindow({width: 1920,height: 1080,webPreferences: { nodeIntegration: true }});  
    win.loadFile('index.html');
    ipcMain.on("init",(e)=>init(e));
    ipcMain.on("init_grid",(e,a)=>getGrid(e,a));
}

app.whenReady().then(() => {  disp()});

function main() {  console.log("HTTP API TV PROGRAM");  init(); } 
/*if (!document.getElementById("popin_hour")) {   popin = document.createElement("div");   popin.id="popin_hour";         popin.style.position="fixed";  popin.style.top="260px";  popin.style.width="100vmax";     popin.style.fontSize="25px"; popin.style.color="rgb(56, 100, 200,0.7)"; popin.style.textAlign="center";              document.body.appendChild(popin);} else { popin = document.getElementById("popin_hour");  }*/