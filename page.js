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

async function init() {
  await loadUserDicts();

  $("#known-words").html([...uDict].length + " words");
}
init();

