var cal = {
  // (A) PROPERTIES
  // (A1) FLAGS & DATA
  mon : false, // monday first
  events : null, // events data for current month/year
  sMth : 0, // selected month
  sYear : 0, // selected year
  sDIM : 0, // number of days in selected month
  sF : 0, // first date of the selected month (yyyymmddhhmm)
  sL : 0, // last date of the selected month (yyyymmddhhmm)
  sFD : 0, // first day of the selected month (mon-sun)
  sLD : 0, // last day of the selected month (mon-sun)
  ready : 0, // to track loading

  // (A2) HTML ELEMENTS
  hMth : null, hYear : null, // month & year
  hCD : null, hCB : null, // calendar days & body
  hFormWrap : null, hForm : null, // event form
  hfID : null, hfStart : null, // event form fields
  hfEnd : null, hfTxt : null,
  hfColor : null, hfBG : null,
  hfDel : null,

  // (A3) INDEXED DB
  iName : "JSCalendar", 
  iDB : null, iTX : null, // idb object & transaction

  // (A4) HELPER FUNCTIONS
  toDate : date => parseInt(date.replace(/-|T|:/g, "")),
  toISODate : date => {
    date = String(date);
    yr = date.slice(0,4); mth = date.slice(4,6); day = date.slice(6,8);
    hr = date.slice(8,10); min = date.slice(10);
    return `${yr}-${mth}-${day}T${hr}:${min}`;
  },

  // (B) INIT
  init : () => {
    // (B1) REQUIREMENTS CHECK - INDEXED DB
    window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    if (!window.indexedDB) {
      alert("Your browser does not support indexed database.");
      return;
    }

    // (B2) REQUIREMENTS CHECK - STORAGE CACHE
    if (!"caches" in window) {
      alert("Your browser does not support cache storage.");
      return;
    }

    // (B3) OPEN IDB
    let req = window.indexedDB.open(cal.iName, 1);

    // (B4) IDB OPEN ERROR
    req.onerror = evt => {
      alert("Indexed DB init error - " + evt.message);
      console.error(evt);
    };

    // (B5) IDB UPGRADE NEEDED
    req.onupgradeneeded = evt => {
      cal.iDB = evt.target.result;

      // (B5-1) IDB UPGRADE ERROR
      cal.iDB.onerror = evt => {
        alert("Indexed DB upgrade error - " + evt.message);
        console.error(evt);
      };

      // (B5-2) IDB VERSION 1
      if (evt.oldVersion < 1) {
        let store = cal.iDB.createObjectStore(cal.iName, {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("s", "s", { unique: false });
        store.createIndex("e", "e", { unique: false });
      }
    };

    // (B6) IDB OPEN OK
    req.onsuccess = evt => {
      cal.iDB = evt.target.result;
      cal.iTX = () => {
        return cal.iDB
        .transaction(cal.iName, "readwrite")
        .objectStore(cal.iName);
      };
      cal.prepare();
    };
  },

  // (C) PREPARE CALENDAR HTML INTERFACE
  prepare : () => {
    // (C1) GET HTML ELEMENTS
    cal.hMth = document.getElementById("calMonth");
    cal.hYear = document.getElementById("calYear");
    cal.hCD = document.getElementById("calDays");
    cal.hCB = document.getElementById("calBody");
    cal.hFormWrap = document.getElementById("calForm");
    cal.hForm = cal.hFormWrap.querySelector("form");
    cal.hfID = document.getElementById("evtID");
    cal.hfStart = document.getElementById("evtStart");
    cal.hfEnd = document.getElementById("evtEnd");
    cal.hfTxt = document.getElementById("evtTxt");
    cal.hfColor = document.getElementById("evtColor");
    cal.hfBG = document.getElementById("evtBG");
    cal.hfDel = document.getElementById("evtDel");

    // (C2) MONTH & YEAR SELECTOR
    let now = new Date(), nowMth = now.getMonth() + 1;
    for (let [i,n] of Object.entries({
      1 : "January", 2 : "Febuary", 3 : "March", 4 : "April",
      5 : "May", 6 : "June", 7 : "July", 8 : "August",
      9 : "September", 10 : "October", 11 : "November", 12 : "December"
    })) {
      let opt = document.createElement("option");
      opt.value = i;
      opt.innerHTML = n;
      if (i==nowMth) { opt.selected = true; }
      cal.hMth.appendChild(opt);
    }
    cal.hYear.value = parseInt(now.getFullYear());

    // (C3) ATTACH CONTROLS
    cal.hMth.onchange = cal.load;
    cal.hYear.onchange = cal.load;
    document.getElementById("calAdd").onclick = () => cal.show();
    cal.hForm.onsubmit = () => cal.save();
    document.getElementById("evtCX").onclick = () => cal.hFormWrap.open = false;
    cal.hfDel.onclick = cal.del;

    // (C4) DRAW DAY NAMES
    let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    if (cal.mon) { days.push("Sun"); } else { days.unshift("Sun"); }
    for (let d of days) {
      let cell = document.createElement("div");
      cell.className = "calCell";
      cell.innerHTML = d;
      cal.hCD.appendChild(cell);
    }

    // (C5) LOAD & DRAW CALENDAR
    cal.load();
  },

  // (D) LOAD EVENTS DATA FOR MONTH/YEAR
  load : () => {
    // (D1) SET SELECTED PERIOD
    cal.sMth = parseInt(cal.hMth.value);
    cal.sYear = parseInt(cal.hYear.value);
    cal.sDIM = new Date(cal.sYear, cal.sMth, 0).getDate();
    cal.sFD = new Date(cal.sYear, cal.sMth-1, 1).getDay();
    cal.sLD = new Date(cal.sYear, cal.sMth-1, cal.sDIM).getDay();
    let m = cal.sMth;
    if (m < 10) { m = "0" + m; }
    cal.sF = parseInt(String(cal.sYear) + String(m) + "010000");
    cal.sL = parseInt(String(cal.sYear) + String(m) + String(cal.sDIM) + "2359");

    // (D2) FETCH INIT
    // inefficient. but no other ways to do complex search in idb.
    cal.ready = 0;
    cal.events = {};
    let rangeA = IDBKeyRange.bound(cal.sF, cal.sL),
        rangeB = IDBKeyRange.lowerBound(cal.sL, true);

    // (D3) GET ALL START DATE THAT FALLS INSIDE MONTH/YEAR
    cal.iTX().index("s").openCursor(rangeA).onsuccess = evt => {
      let cursor = evt.target.result;
      if (cursor) {
        if (!cal.events[cursor.value.id]) {
          cal.events[cursor.value.id] = cursor.value;
        }
        cursor.continue();
      } else { cal.loading(); }
    };

    // (D4) GET ALL END DATE THAT FALLS INSIDE MONTH/YEAR
    cal.iTX().index("e").openCursor(rangeA).onsuccess = evt => {
      let cursor = evt.target.result;
      if (cursor) {
        if (!cal.events[cursor.value.id]) {
          cal.events[cursor.value.id] = cursor.value;
        }
        cursor.continue();
      } else { cal.loading(); }
    };

    // (D5) END DATE AFTER SELECTED MONTH/YEAR, BUT START IS BEFORE
    cal.iTX().index("e").openCursor(rangeB).onsuccess = evt => {
      let cursor = evt.target.result;
      if (cursor) {
        if (cursor.value.start<cal.sFirst && !cal.events[cursor.value.id]) {
          cal.events[cursor.value.id] = cursor.value;
        }
        cursor.continue();
      } else { cal.loading(); }
    };
  },

  // (E) LOADING CHECK
  loading : () => {
    cal.ready++;
    if (cal.ready==3) { cal.draw(); }
  },

  // (F) DRAW CALENDAR
  draw : () => {
    // (F1) CALCULATE DAY MONTH YEAR
    // note - jan is 0 & dec is 11 in js
    // note - sun is 0 & sat is 6 in js
    let now = new Date(), // current date
        nowMth = now.getMonth()+1, // current month
        nowYear = parseInt(now.getFullYear()), // current year
        nowDay = cal.sMth==nowMth && cal.sYear==nowYear ? now.getDate() : null ;

    // (F2) DRAW CALENDAR ROWS & CELLS
    // (F2-1) INIT + HELPER FUNCTIONS
    let rowA, rowB, rowC, rowMap = {}, rowNum = 1,
        cell, cellNum = 1,
    rower = () => {
      rowA = document.createElement("div");
      rowB = document.createElement("div");
      rowC = document.createElement("div");
      rowA.className = "calRow";
      rowA.id = "calRow" + rowNum;
      rowB.className = "calRowHead";
      rowC.className = "calRowBack";
      cal.hCB.appendChild(rowA);
      rowA.appendChild(rowB);
      rowA.appendChild(rowC);
    },
    celler = day => {
      cell = document.createElement("div");
      cell.className = "calCell";
      if (day) { cell.innerHTML = day; }
      rowB.appendChild(cell);
      cell = document.createElement("div");
      cell.className = "calCell";
      if (day===undefined) { cell.classList.add("calBlank"); }
      if (day!==undefined && day==nowDay) { cell.classList.add("calToday"); }
      rowC.appendChild(cell);
    };
    cal.hCB.innerHTML = ""; rower();

    // (F2-2) BLANK CELLS BEFORE START OF MONTH
    if (cal.mon && cal.sFD != 1) {
      let blanks = cal.sFD==0 ? 7 : cal.sFD ;
      for (let i=1; i<blanks; i++) { celler(); cellNum++; }
    }
    if (!cal.mon && cal.sFD != 0) {
      for (let i=0; i<cal.sFD; i++) { celler(); cellNum++; }
    }

    // (F2-3) DAYS OF THE MONTH
    for (let i=1; i<=cal.sDIM; i++) {
      rowMap[i] = { r : rowNum, c : cellNum };
      celler(i);
      if (cellNum%7==0) { rowNum++; rower(); }
      cellNum++;
    }

    // (F2-4) BLANK CELLS AFTER END OF MONTH
    if (cal.mon && cal.sLD != 0) {
      let blanks = cal.sLD==6 ? 1 : 7-cal.sLD;
      for (let i=0; i<blanks; i++) { celler(); cellNum++; }
    }
    if (!cal.mon && cal.sLD != 6) {
      let blanks = cal.sLD==0 ? 6 : 6-cal.sLD;
      for (let i=0; i<blanks; i++) { celler(); cellNum++; }
    }

    // (F3) DRAW EVENTS
    if (Object.keys(cal.events).length > 0) { for (let [id,evt] of Object.entries(cal.events)) {
      // (F3-1) EVENT START & END DAY
      let sd = new Date(cal.toISODate(evt.s)),
          ed = new Date(cal.toISODate(evt.e));
      sd = sd.getMonth()+1 < cal.sMth ? 1 : sd.getDate();
      ed = ed.getMonth()+1 > cal.sMth ? cal.sDIM : ed.getDate();

      // (F3-2) "MAP" ONTO HTML CALENDAR
      cell = {}; rowNum = 0;
      for (let i=sd; i<=ed; i++) {
        if (rowNum!=rowMap[i]["r"]) {
          cell[rowMap[i]["r"]] = { s:rowMap[i]["c"], e:0 };
          rowNum = rowMap[i]["r"];
        }
        if (cell[rowNum]) { cell[rowNum]["e"] = rowMap[i]["c"]; }
      }

      // (F3-3) DRAW HTML EVENT ROW
      for (let [r,c] of Object.entries(cell)) {
        let o = c.s - 1 - ((r-1) * 7), // event cell offset
            w = c.e - c.s + 1; // event cell width
        rowA = document.getElementById("calRow"+r);
        rowB = document.createElement("div");
        rowB.className = "calRowEvt";
        rowB.innerHTML = cal.events[id]["t"];
        rowB.style.color = cal.events[id]["c"];
        rowB.style.backgroundColor  = cal.events[id]["b"];
        rowB.classList.add("w"+w);
        if (o!=0) { rowB.classList.add("o"+o); }
        rowB.onclick = () => cal.show(id);
        rowA.appendChild(rowB);
      }
    }}
  },

  // (G) SHOW EVENT FORM
  show : id => {
    if (id) {
      cal.hfID.value = id;
      cal.hfStart.value = cal.toISODate(cal.events[id]["s"]);
      cal.hfEnd.value = cal.toISODate(cal.events[id]["e"]);
      cal.hfTxt.value = cal.events[id]["t"];
      cal.hfColor.value = cal.events[id]["c"];
      cal.hfBG.value = cal.events[id]["b"];
      cal.hfDel.style.display = "inline-block";
    } else {
      cal.hForm.reset();
      cal.hfID.value = "";
      cal.hfDel.style.display = "none";
    }
    cal.hFormWrap.open = true;
  },

  // (H) SAVE EVENT
  save : () => {
    // (H1) COLLECT DATA
    // s & e : start & end date
    // c & b : text & background color
    // t : event text
    var data = {
      s : cal.toDate(cal.hfStart.value),
      e : cal.toDate(cal.hfEnd.value),
      t : cal.hfTxt.value,
      c : cal.hfColor.value,
      b : cal.hfBG.value
    };
    if (cal.hfID.value != "") { data.id = parseInt(cal.hfID.value); }
    console.log(data);

    // (H2) DATE CHECK
    if (new Date(data.s) > new Date(data.e)) {
      alert("Start date cannot be later than end date!");
      return false;
    }

    // (H3) SAVE
    if (data.id) { cal.iTX().put(data); }
    else { cal.iTX().add(data); }
    cal.hFormWrap.open = false;
    cal.load();
    return false;
  },

  // (I) DELETE EVENT
  del : () => { if (confirm("Delete Event?")) {
    cal.iTX().delete(parseInt(cal.hfID.value));
    cal.hFormWrap.open = false;
    cal.load();
  }}
};
window.onload = cal.init;