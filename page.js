var uDict, oDict;

function importJSON(e) {
  var jsonValue = JSON.parse($('#text').val());

  for (var u of jsonValue['uDict']) {
    uDict.add(u);
  }

  for (var o of jsonValue['oDict']) {
    oDict.add(o);
  }
  writeUDict();
  writeODict();
  $("#known-words").html([...uDict].length + " words");
  writeJapNumber();
}
$("#import").click(importJSON);

function exportJSON() {
  var jsonObj = {
    uDict: [...uDict],
    oDict: [...oDict]
  };
  var blob = new Blob([JSON.stringify(jsonObj)], { type: "text/plain;charset=utf-8" });
  var url = window.URL || window.webkitURL;
  var link = url.createObjectURL(blob);
  var a = document.createElement("a");
  a.download = "userDict.json";
  a.href = link;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
$("#export").click(exportJSON);

function deleteDicts() {
  exportJSON();

  browser.runtime.sendMessage({request: 'dropAll'});
}
$("#delete").click(deleteDicts);

async function init() {
  uDict = await browser.runtime.sendMessage({request: 'getUDict'});
  oDict = await browser.runtime.sendMessage({request: 'getODict'});

  $("#known-words").html([...uDict].length + " words");
  writeJapNumber();
}
init();

async function writeUDict() {
  return browser.runtime.sendMessage({request: 'writeUDict', dict: [...uDict]}); }
async function writeODict() {
  return browser.runtime.sendMessage({request: 'writeODict', dict: [...oDict]}); }

function getDigit(digit, ones=true) {
  digit = Math.floor(digit) % 10;
  if (!digit) return '';
  if (!ones && digit == 1) return '';
  return '一二三四五六七八九'.charAt(digit - 1);
}
function writeJapNumber() {
  var number = [...uDict].length;
  var numberStr = '' + number;

  var str = '語';
  if (numberStr.length >= 1) str = getDigit(number) + str;
  if (numberStr.length >= 2) str = getDigit(number/10, false) + '十' + str;
  if (numberStr.length >= 3) str = getDigit(number/100, false) + '百' + str;
  if (numberStr.length >= 4) str = getDigit(number/1000, false) + '千' + str;
  if (numberStr.length >= 5) str = getDigit(number/10000) + '万' + str;

  $("#jap").html(str);
}

