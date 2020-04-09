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
}
init();

async function writeUDict() {
  return browser.runtime.sendMessage({request: 'writeUDict', dict: [...uDict]}); }
async function writeODict() {
  return browser.runtime.sendMessage({request: 'writeODict', dict: [...oDict]}); }

