var content = null;
var text = "";
var searchingForDiv = true;

var forcedBreaks = [];
var breaks = [];
var words = [];
var searchMaxLen = 7;

var d_index, k_index, r_index, uDict, oDict;

loadIndexes();

async function loadIndexes() {
  console.log("Attempting to fetch dictionary and indexes from localstorage");
  var localStorage = await browser.storage.local.get([
    "d_index", "k_index", "r_index", "uDict", "oDict"]);
  d_index = localStorage["d_index"];
  // Key-value from: Kanji reading of word -> array of indices in dict
  k_index = localStorage["k_index"];
  // Key-value from: Kana reading of word -> array of indices in dict
  r_index = localStorage["r_index"];

  // Fetch user dictionary
  uDict = new Set();
  var uDictStorage = localStorage["uDict"];
  if ($.isArray(uDictStorage) && uDictStorage.length>0)
    uDict = new Set(uDictStorage);

  // Fetch unknown words dictionary
  oDict = new Set();
  var oDictStorage = localStorage["oDict"];
  if ($.isArray(oDictStorage) && oDictStorage.length>0)
    oDict = new Set(oDictStorage);

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
  var resp = await fetch(browser.runtime.getURL("JMdict_e.json"));
  var dict = await resp.json();
  console.log("\tDone");

  // Index the dict ent_seq ids
  d_index = {};
  for (var i = 0; i < dict.length; i++) {
    d_index[i] = dict[i].ent_seq[0];
  }
  
  // Create indexes for the kanji and kana values
  k_index = {};
  r_index = {};
  for (var i = 0; i < dict.length; i++) {
    if (dict[i].k_ele != undefined) for (var j = 0; j < dict[i].k_ele.length; j++) {
      if (dict[i].k_ele[j].keb.length != 1)
        console.log("keb length != 1 at index " + i);
      var keb = dict[i].k_ele[j].keb[0];

      if (k_index[keb] == undefined)
        k_index[keb] = [i];
      else
        k_index[keb].push(i);
    }

    if (dict[i].r_ele != undefined) for (var j = 0; j < dict[i].r_ele.length; j++) {
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
    await browser.storage.local.set({"d_index": d_index});
    await browser.storage.local.set({"k_index": k_index});
    await browser.storage.local.set({"r_index": r_index});
  }catch (e) {
  }

  // Remove dict reference to reduce memory usage
  dict = null;
}

// Highlight the hovered element (For selecting content)
prevElement = null;
function highlightHover(e) {
  var elem = e.target || e.srcElement;
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
  elem.classList.add("jr-hover");
  prevElement = elem;
}
document.body.addEventListener('mousemove', highlightHover, false);

async function selectContent(e) {
  var elem = e.target || e.srcElement;
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
  content = elem;
  searchingForDiv = false;
  document.body.removeEventListener("mousemove", highlightHover);
  document.body.removeEventListener("click", selectContent);
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
  await parsePage();
}
document.body.addEventListener('click', selectContent, false);

async function parsePage() {
  if (!content) {
    console.log("parsePage() called without content set");
    return;
  }

  text = content.textContent;

  // Try to find all the words in the text
  console.log("Parsing page for word breaks");
  findBreaks();

  content.addEventListener('click', textClicked, false);
}

// Find word breaks in text
function findBreaks() {
  breaks = [];
  words = [];

  // Try to find all the words in the text
  console.log("Searching page for words");
  var breakIndex = 0;
  var nextBreak = forcedBreaks[breakIndex] || 999999;
  for (var i = 0; i < text.length; i++) {
    while (i >= nextBreak) nextBreak = forcedBreaks[++breakIndex] || 999999;
    for (var j = Math.min(nextBreak - i, searchMaxLen); j > 0; j--) {
      var subText = text.substring(i, i + j);

      if (isWord(subText)) {
        breaks.push(i);
        words.push(subText);
        i += subText.length - 1;
        break;
      }
    }
  }

  console.log("Matching words against user dictionary...");
  for (var i = 0; i < breaks.length; i++) {
    var word = words[i];
    if (oDict.has(dictIndex(word)))
      hlText(content.childNodes[0], breaks[i], word.length);
    else if (uDict.has(dictIndex(word)) == false)
      markText(content.childNodes[0], breaks[i], word.length);
  }
  console.log("\tDone");
}

async function addAllMarkedWords() {
  var nWordsPre = uDict.size;
  for (var i = 0; i < words.length; i++) {
    var dIndex = dictIndex(words[i]);
    if (oDict.has(dIndex) == false)
      uDict.add(dIndex);
  }
  await browser.storage.local.set({"uDict": [...uDict]});
  console.log("Added", uDict.size - nWordsPre, "words!");

  // Reflow words
  clearMarking(content);
  findBreaks();
}
document.addEventListener('keyup', e => {
  if (e.ctrlKey && !e.shiftKey && e.keyCode == 90) addAllMarkedWords();
}, false);

function getWordAt(from) {
var nextBreak = forcedBreaks.find(e => e > from) || 999999;
  for (var i = Math.min(nextBreak - from, searchMaxLen); i > 0; i--) {
    var subText = text.substring(from, from + i);

    if (isWord(subText)) {
      return subText;
    }
  }
}

// Check if this word (or a conjugation) exists in the dictionary
// Returns dictionary form
function isWord(word) {
  // Does the word exist as is?
  var out = false;
  if (out = inDict(word)) return out;

  // Check for negative form
  var negative = word.replace(/ないで$/, 'ない').replace(/なくても$/, 'ない')
                  .replace(/なくて$/, 'ない');
  if (negative.match(/ない$/)) {
    var base = negative.replace(/らない$/, 'る').replace(/わない$/, 'う')
                .replace(/たない$/, 'つ').replace(/かない$/, 'く')
                .replace(/がない$/, 'ぐ').replace(/まない$/, 'む')
                .replace(/なない$/, 'ぬ').replace(/ばない$/, 'ぶ')
                .replace(/さない$/, 'す').replace(/ない$/, 'る');

    if (inDict(base)) return base;
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
  var tari = word.replace(/たり$/, 'た').replace(/だり$/, 'だ');
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

  // Is it want-to form of a verb?
  if (out = inDict(deConjugateEnding(word, 'たい', 'る'))) return out;

  // Is it polite form of something? (行きます、行きたい)
  // If so this will turn it into base form
  polite = word.replace(/ます$/, '').replace(/ました$/, '')
              .replace(/ません$/, '').replace(/たい$/, '')
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

  // Check い-adjectives
  if (out = inDict(deConjugateEnding(word, 'そう', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'く', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'くて', 'い'))) return out;
  if (out = inDict(deConjugateEnding(word, 'かった', 'い')))
    return out;

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

async function textClicked(e) {
  let range;

  // User clicked, toggle a forced break on this word and add it to the users dict
  //
  // If Ctrl is held, make the word yellow

  // Get selection
  var sel = document.getSelection();
  var textNode = sel.focusNode;
  var offset = sel.focusOffset;
  var globalOffs = flatIndex(content, textNode, offset);

  // If the user Ctrl clicked a word, add it to the unknown word dictionary
  if (e.ctrlKey) {
    // If this is in the middle of a word, add a forced break and make the word yellow
    if (breaks.includes(globalOffs) == false
          && forcedBreaks.includes(globalOffs) == false) {
      forcedBreaks.push(globalOffs);
      console.log("Add force break at", globalOffs);

      // Reflow words with the new break
      clearMarking(content);
      findBreaks();
    }

    // Clear the word from uDict and add it to oDict
    var word = words[breaks.indexOf(globalOffs)];
    var base = isWord(word);
    var dIndex = dictIndex(word);
    if (word) {
      if (oDict.has(dIndex)) {
        oDict.delete(dIndex);
        console.log("Remove", word, "("+base+")", "from oDict");
      }else {
        uDict.delete(dIndex);
        oDict.add(dIndex);
        console.log("Add", word, "("+base+")", "to oDict");
      }
    }

    await browser.storage.local.set({"oDict": [...oDict]});

  // If the user clicked a break
  // Toggle between adding it to uDict and removing it
  }else if (breaks.includes(globalOffs)) {
    var word = words[breaks.indexOf(globalOffs)];
    var base = isWord(word);
    var dIndex = dictIndex(word);
    if (uDict.has(dIndex)) {
      uDict.delete(dIndex);
      console.log("Remove", word, "("+base+")", "from uDict");

      // Remove the forced break here if there is one
      forcedBreaks = forcedBreaks.filter(e => e !== globalOffs);
      console.log("Filter force break at", word, "("+base+")");

    }else {
      uDict.add(dIndex);
      oDict.delete(dIndex);
      console.log("Add", word, "("+base+")", "to uDict");
    }

    await browser.storage.local.set({"uDict": [...uDict]});

  }else {
    // Otherwise, add this point as a forced break
    forcedBreaks.push(globalOffs);
    console.log("Add force break at", globalOffs);
  }

  // Toggle a forced break on the clicked word
  // if (forcedBreaks.includes(globalOffs))
  //   forcedBreaks = forcedBreaks.filter(e => e !== globalOffs);
  // else forcedBreaks.push(globalOffs);

  forcedBreaks.sort((a, b) => a - b);

  // Reflow words with the new break
  clearMarking(content);
  findBreaks();
}

function flatIndex(pNode, target, index) {
  // Find the position in the text of 'index' relative to the parent node

  var newIndex = 0;
  // Loop through the parent nodes children
  for (var i = 0; i < pNode.childNodes.length; i++) {
    var cNode = pNode.childNodes[i];

    if (cNode == target)
      return newIndex + index;

    if (!cNode.contains(target))
      newIndex += cNode.textContent.length;

    // if it does have target as child, recurse
    else return newIndex + flatIndex(cNode, target, index);
  }
}

function nextTextNode(node) {
  do {
    if (node.childNodes.length > 0)           // Search child nodes
      node = node.childNodes[0];
    else if (node.nextSibling) {              // Search siblings
      node = node.nextSibling;
    }else {                                   // Search up to a parent with a sibling
      var par = node.parentNode;
      while (!par.nextSibling) {
        if (!par.parentNode) return null;
        par = par.parentNode;
      }
      node = par.nextSibling;
    }
  }while (node.nodeType !== Node.TEXT_NODE);
  return node;
}
function addHlSpan(node, className) {
  var hl = $('<span class="'+className+'"></span>')[0];
  hl.innerHTML = node.nodeValue;
  node.replaceWith(hl);
}

function markText(node, start, len) { addHl(node, start, len, 'jr-new'); }
function hlText(node, start, len) { addHl(node, start, len, 'jr-hl'); }
function addHl(node, start, len, className) {
	// Only care about text nodes
	// list containing every text node to highlight
  var textNodes = [];
  var origNode = node;

	// Start on the starting node and search for the text node containing the 'start' text
  if (node.nodeType !== Node.TEXT_NODE) node = nextTextNode(node);
  while (start >= node.textContent.length) {
    start -= node.textContent.length;
    node = nextTextNode(node);
  }

	// Split that node if start is in the middle of the text
  if (start > 0) node = node.splitText(start);
	// Split end if string ends in this node too
  if (len < node.textContent.length) node.splitText(len);
  if (len <= node.textContent.length) {
		// If so, highlight that node and return here
    addHlSpan(node, className);
    return;
  }
	// Add this first text node to list
  textNodes.push(node);

  // Text overflowed the text node, go to next text node
  len -= node.textContent.length;
	while (node = nextTextNode(node)) {
    textNodes.push(node); // Add every next node until we reach end of text

		// Split end if string ends in this node
    if (len <= node.textContent.length) {
      if (len < node.textContent.length) node.splitText(len);

			// If so, highlight every node in list and return
      for (var i = 0; i < textNodes.length; i++) {
        addHlSpan(textNodes[i], className);
      }
      origNode.normalize();
      return;
    }
    len -= node.textContent.length;
  }
}
function addHlOld(node, start, len, className) {
  if (!node) return;

  // Check if the start index is in this node or if it flows over to the next sibling
  while (start >= node.textContent.length) {
    start -= node.textContent.length;
    node = node.nextSibling;
  }

  // If this is not a text node, recurse into first child
  if (!node.splitText) {
    addHl(node.childNodes[0], start, len, className);
    return;
  }
  var marked = node;
  if (start > 0) marked = marked.splitText(start);
  marked.splitText(len);
  var hl = $('<span class="'+className+'"></span>')[0];
  hl.innerHTML = marked.nodeValue;
  marked.replaceWith(hl);
  node.normalize();
}
function clearMarking(node) {
  $(node).find(".jr-new").contents().unwrap();
  $(node).find(".jr-hl").contents().unwrap();
  node.normalize();
}
// markText(content.childNodes[0], 10, 3);

