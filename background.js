/* Background.js
 *
 * Loads the dictionary indexes and user dictionaries when the plugin is started.
 */

var active = false;
var d_index, k_index, r_index;
var searchMaxLen = 7;

loadUserDicts().then(() => {
  console.log("syncIP:", syncIP);
  if (syncIP) connect(syncIP);
});

browser.runtime.onMessage.addListener(onMessage);
function onMessage(data, sender, response) {
  // console.log("onMessage("+data.request+")");
  if (!data["request"]) {
    console.log("No request value for message");
    return;
  }
  switch (data.request) {
    case "start": {
      if (active) return;
      active = true;
      loadIndexes(); /* eslint-disable-line */
      updateDayDict();
      connect(syncIP);
      return;
    }
    case "stop": {
      if (!active) return;
      active = false;
      d_index = k_index = r_index = null;
      return;
    }
    case "connect": {
      response(connect(data.ip));
      return;
    }
    case "isActive": {
      response(active);
      return;
    }
    case "isSynced": {
      response(syncConnected);
      return;
    }
    case "syncIP": {
      response(syncIP);
      return;
    }
    case "sync": {  // Send our dicts and read the remotes dicts
      syncThrottled(); // Only send once every 20 seconds
      return;
    }
    case "findBreaks": {
      response(findBreaks(data.text, data.forcedBreaks));
      return;
    }
    case "findMarkings": {
      response(findMarkings(data.words, data.firstChange,
        data.uWordsOld, data.oWordsOld));
      return;
    }
    case "findLongestWord": {
      response(findLongestWord(data.text));
      return;
    }
    case "isWord": {
      response(isWord(data.word));
      return;
    }
    case "inDict": {
      response(inDict(data.word));
      return;
    }
    case "dictIndex": {
      response(dictIndex(data.word));
      return;
    }
    case "getUDict": {
      response([...uDict]);
      return;
    }
    case "getODict": {
      response([...oDict]);
      return;
    }
    case "writeUDict": {
      for (let v of data.dict) uDict.add(v);
      writeUDict();
      return;
    }
    case "writeODict": {
      for (let v of data.dict) oDict.add(v);
      writeODict();
      return;
    }
    case "removeUWord": {
      uDict.delete(data.index);
      writeUDict();
      deleteFromSync({uDict: [data.index]});
      return;
    }
    case "removeOWord": {
      oDict.delete(data.index);
      writeODict();
      deleteFromSync({oDict: [data.index]});
      return;
    }
    case "dropAll": {
      uDict.clear();
      oDict.clear();
      writeUDict();
      writeODict();
      return;
    }
    case "newToday": {
      updateDayDict().then(() => {
        response([...uDict].filter(i => !dayDict.has(i)).length);
      });
      return true;
    }
    case "resetDay": {
      resetDay();
      return;
    }
    case "getSwitchOverHour": {
      updateDayDict().then(() => {
        response(switchOverHour);
      });
      return true;
    }
    case "setSwitchOverHour": {
      switchOverHour = data.hour;
      browser.storage.local.set({"switchOverHour": data.hour}).then(() => {
        response();
      });
      return true;
    }
    default: {
      console.log("No handler for command", data.request);
    }
  }
}

// Find word breaks in text
async function findBreaks(text, forcedBreaks) {
  var breaks = [];
  var words = [];
  var indices = [];

  // Try to find all the words in the text
  console.log("Searching page for words");
  var breakIndex = 0;
  var nextBreak = forcedBreaks[breakIndex] || 999999;
  for (var i = 0; i < text.length; i++) {
    while (i >= nextBreak) nextBreak = forcedBreaks[++breakIndex] || 999999;

    var subText = findLongestWord(
      text.substring(i, i + Math.min(nextBreak - i, searchMaxLen)));
    if (!subText) continue;

    // Handle single character particles ruining the next word
    // If the character after this one gives a longer or equal length word as
    // this one then this character might just be a particle
    if ('はがをでにやもとの'.includes(text[i])) {
      var nextWord = findLongestWord(
        text.substring(i+1, i + Math.min(nextBreak - i, searchMaxLen)));
      if (nextWord && nextWord.length >= subText.length)
        subText = text[i];
    }

    breaks.push(i);
    words.push(subText);
    indices.push(dictIndex(subText));
    i += subText.length - 1;
  }

  var marks = await findMarkings(words);

  return { words: words, indices: indices, breaks: breaks,
    uWords: marks.uWords, oWords: marks.oWords };
}

// Find what words are in uDict and oDict
function findMarkings(words, firstChange=0, uWordsOld, oWordsOld) {
  console.log("Matching words against user dictionary...");
  var uWords = [], oWords = [];
  if (uWordsOld && oWordsOld) {
    uWords = uWordsOld.filter(e => e < firstChange);
    oWords = oWordsOld.filter(e => e < firstChange);
  }
  console.log(words, firstChange, uWordsOld, oWordsOld);
  for (var i = firstChange; i < words.length; i++) {
    var word = words[i];
    if (oDict.has(dictIndex(word)))
      oWords.push(i);
    else if (uDict.has(dictIndex(word)) == false)
      uWords.push(i);
  }
  console.log("\tDone");

  return { uWords: uWords, oWords: oWords };
}

function findLongestWord(text) {
  for (var i = text.length; i > 0; i--) {
    var subText = text.substring(0, i);

    if (isWord(subText)) {
      return subText;
    }
  }
}

async function loadIndexes() {
  console.log("Attempting to fetch dictionary and indexes from localstorage");
  var localStorage = await browser.storage.local.get(["d_index", "k_index", "r_index"]);
  d_index = localStorage["d_index"];
  d_index = typeof d_index == 'string' ? JSON.parse(d_index) : d_index;
  // Key-value from: Kanji reading of word -> array of indices in dict
  k_index = localStorage["k_index"];
  k_index = typeof k_index == 'string' ? JSON.parse(k_index) : k_index;
  // Key-value from: Kana reading of word -> array of indices in dict
  r_index = localStorage["r_index"];
  r_index = typeof r_index == 'string' ? JSON.parse(r_index) : r_index;

  await loadDict();
}

// Load dict and the indices, from localstorage if there
async function loadDict() {
  if (d_index && k_index && r_index) {
    console.log("Using cached dictionary");
    return;
  }

  // Get the dictionary
  console.log("Downloading dictionary...");
  var resp = await fetch(browser.runtime.getURL("JMdict_e.json.txt"));
  var dict = await resp.json();
  console.log("\tDone");

  // Index the dict ent_seq ids
  d_index = {};
  let i, j;
  for (i = 0; i < dict.length; i++) {
    d_index[i] = dict[i].ent_seq[0];
  }

  // Create indexes for the kanji and kana values
  k_index = {};
  r_index = {};
  for (i = 0; i < dict.length; i++) {
    if (dict[i].k_ele != undefined) for (j = 0; j < dict[i].k_ele.length; j++) {
      if (dict[i].k_ele[j].keb.length != 1)
        console.log("keb length != 1 at index " + i);
      var keb = dict[i].k_ele[j].keb[0];

      if (k_index[keb] == undefined)
        k_index[keb] = [i];
      else
        k_index[keb].push(i);
    }

    if (dict[i].r_ele != undefined) for (j = 0; j < dict[i].r_ele.length; j++) {
      if (dict[i].r_ele[j].reb.length != 1)
        console.log("reb length != 1 at index " + i);
      var reb = dict[i].r_ele[j].reb[0];

      if (r_index[reb] == undefined)
        r_index[reb] = [i];
      else
        r_index[reb].push(i);
    }
  }

  console.log("Indexed dictionary");

  // Store the indexes
  console.log("Saving the indexes");
  try {
    await browser.storage.local.set({"d_index": JSON.stringify(d_index)});
    await browser.storage.local.set({"k_index": JSON.stringify(k_index)});
    await browser.storage.local.set({"r_index": JSON.stringify(r_index)});
  }catch (e) {
    console.log(e);
  }

  // Remove dict reference to reduce memory usage
  dict = null;
}

// Check if this word (or a conjugation) exists in the dictionary
// Returns dictionary form
function isWord(word) {
  // Does the word exist as is?
  var out = false;
  if (out = inDict(word)) return out;

  // Check for negative form
  var negative = word.replace(/なく$/, 'ない').replace(/ないで$/, 'ない')
          .replace(/なくても$/, 'ない').replace(/なくて$/, 'ない')
          .replace(/なければ$/, 'ない').replace(/なかった$/, 'ない')
          .replace(/なかったら$/, 'ない').replace(/ん$/, 'ない')
          .replace(/ず$/, 'ない');
  if (negative.match(/ない$/)) {
    var base = negative.replace(/らない$/, 'る').replace(/わない$/, 'う')
                .replace(/たない$/, 'つ').replace(/かない$/, 'く')
                .replace(/がない$/, 'ぐ').replace(/まない$/, 'む')
                .replace(/なない$/, 'ぬ').replace(/ばない$/, 'ぶ')
                .replace(/さない$/, 'す').replace(/ない$/, 'る');

    if (inDict(base)) return base;
  }

  // Check for ば-conditional form
  if (word.charAt(word.length - 1) == 'ば') {
    var nWord = word.substring(0, word.length - 2);
    switch (word.charAt(word.length - 2)) {
      case 'え': nWord += 'う'; break;
      case 'て': nWord += 'つ'; break;
      case 'れ': nWord += 'る'; break;
      case 'け': nWord += 'く'; break;
      case 'げ': nWord += 'ぐ'; break;
      case 'め': nWord += 'む'; break;
      case 'ね': nWord += 'ぬ'; break;
      case 'べ': nWord += 'ぶ'; break;
      case 'せ': nWord += 'す'; break;
    }
    if (inDict(nWord)) return nWord;
  }

  // Is it て-form of a verb?
  if (out = inDict(deConjugateEnding(word, 'て',   'る')))  return out;
  if (out = inDict(deConjugateEnding(word, 'って', 'う')))  return out;
  if (out = inDict(deConjugateEnding(word, 'って', 'つ')))  return out;
  if (out = inDict(deConjugateEnding(word, 'って', 'る')))  return out;
  if (out = inDict(deConjugateEnding(word, 'いて', 'く')))  return out;
  if (out = inDict(deConjugateEnding(word, 'いで', 'ぐ')))  return out;
  if (out = inDict(deConjugateEnding(word, 'んで', 'む')))  return out;
  if (out = inDict(deConjugateEnding(word, 'んで', 'ぬ')))  return out;
  if (out = inDict(deConjugateEnding(word, 'んで', 'ぶ')))  return out;
  if (out = inDict(deConjugateEnding(word, 'して', 'す')))  return out;

  // Is it past-tense of a verb?
  var tari = word.replace(/たら$/, 'た').replace(/たり$/, 'た')
          .replace(/だり$/, 'だ');
  if (out = inDict(deConjugateEnding(tari, 'た',   'る')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'った', 'う')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'った', 'つ')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'った', 'る')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'いた', 'く')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'いだ', 'ぐ')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'んだ', 'む')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'んだ', 'ぬ')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'んだ', 'ぶ')))  return out;
  if (out = inDict(deConjugateEnding(tari, 'した', 'す')))  return out;

  // Is it casual volitional form? (やろう!)
  var volitional = word.replace(/ろう$/, 'る').replace(/おう$/, 'う')
                .replace(/とう$/, 'つ').replace(/こう$/, 'く')
                .replace(/ごう$/, 'ぐ').replace(/もう$/, 'む')
                .replace(/のう$/, 'ぬ').replace(/ぼう$/, 'ぶ')
                .replace(/そう$/, 'す').replace(/よう$/, 'る');
  if (inDict(volitional)) return volitional;

  // Is it polite form of something? (行きます、行きたい)
  // If so this will turn it into base form
  let polite = word.replace(/る$/, '').replace(/ます$/, '').replace(/ました$/, '')
              .replace(/ません$/, '').replace(/たい$/, '').replace(/たく$/, '')
              .replace(/ましょう$/, '').replace(/そう$/, '');

  // Turn base form into verb
  if (inDict(polite + 'る')) return polite + 'る';
  if (out = inDict(deConjugateEnding(polite, 'り', 'る'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'い', 'う'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'ち', 'つ'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'き', 'く'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'ぎ', 'ぐ'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'み', 'む'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'に', 'ぬ'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'び', 'ぶ'))) return out;
  if (out = inDict(deConjugateEnding(polite, 'し', 'す'))) return out;
  if (inDict(polite)) return polite; // Check pure base form

  // Check い-adjectives
  if (out = inDict(deConjugateEnding(word, 'そう', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'く', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'くて', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'さ', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'かった', 'い'))) return out;

  return false;
}

function deConjugateEnding(word, conj, base) {
  if (word.slice(-conj.length) == conj)
    return word.substring(0, word.length - conj.length) + base;
}

function inDict(word) {
  if (!word) return false;

  if (r_index[word] != undefined || k_index[word] != undefined) return word;

  // Check variations on verb, e.g 殺せる potential form
  if (word.charAt(word.length - 1) == 'る') {
    var nWord = word.substring(0, word.length - 2);
    switch (word.charAt(word.length - 2)) {
      case 'え': nWord += 'う'; break;
      case 'て': nWord += 'つ'; break;
      case 'れ': nWord += 'る'; break;
      case 'け': nWord += 'く'; break;
      case 'げ': nWord += 'ぐ'; break;
      case 'め': nWord += 'む'; break;
      case 'ね': nWord += 'ぬ'; break;
      case 'べ': nWord += 'ぶ'; break;
      case 'せ': nWord += 'す'; break;
    }
    if (nWord.length == word.length - 1 && inDict(nWord)) return nWord;

    // Check passive form
    if (word.substring(word.length-2,word.length) == 'れる') {
      var pWord = word.substring(0, word.length - 3);
      switch (word.charAt(word.length - 3)) {
        case 'わ': pWord += 'う'; break;
        case 'た': pWord += 'つ'; break;
        case 'ら': pWord += 'る'; break;
        case 'か': pWord += 'く'; break;
        case 'が': pWord += 'ぐ'; break;
        case 'ま': pWord += 'む'; break;
        case 'な': pWord += 'ぬ'; break;
        case 'ば': pWord += 'ぶ'; break;
        case 'さ': pWord += 'す'; break;
      }
      if (pWord.length == word.length - 2 && inDict(pWord)) return pWord;
    }

    // Check causative form
    if (word.substring(word.length-2,word.length) == 'せる') {
      var cWord = word.substring(0, word.length - 3);
      switch (word.charAt(word.length - 3)) {
        case 'わ': cWord += 'う'; break;
        case 'た': cWord += 'つ'; break;
        case 'ら': cWord += 'る'; break;
        case 'か': cWord += 'く'; break;
        case 'が': cWord += 'ぐ'; break;
        case 'ま': cWord += 'む'; break;
        case 'な': cWord += 'ぬ'; break;
        case 'ば': cWord += 'ぶ'; break;
        case 'さ': cWord += 'す'; break;
      }
      if (cWord.length == word.length - 2 && inDict(cWord)) return cWord;
    }
  }
}

function dictIndex(word) {
  var base = isWord(word);
  var index;
  if (k_index[base]) index = k_index[base][0];
  else if (r_index[base]) index = r_index[base][0];
  else return undefined;
  return d_index[index];
}

/* global loadUserDicts, uDict, oDict, dayDict, syncIP, loadUserDicts,
 * updateDayDict, writeUDict, writeODict, writeSync, resetDay, connect,
 * syncConnected, syncThrottled, deleteFromSync, switchOverHour */

