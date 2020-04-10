var content = null;
var text = "";
var searchingForDiv = false;

var forcedBreaks = [];
var breaks = [];
var words = [];

var uDict, oDict, uWords, oWords;
var uNodes = [], oNodes = [];

// Highlight the hovered element (For selecting content)
prevElement = null;
function highlightHover(e) {
  var elem = e.target || e.srcElement;
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
  elem.classList.add("jr-hover");
  prevElement = elem;
}

async function selectContent(e) {
  var elem = e.target || e.srcElement;
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
  content = elem;
  clearMarking(content);
  searchingForDiv = false;
  forcedBreaks = [];
  document.body.removeEventListener("mousemove", highlightHover);
  document.body.removeEventListener("click", selectContent);
  if (prevElement!= null) {prevElement.classList.remove("jr-hover");}

  uDict = await browser.runtime.sendMessage({request: 'getUDict'});
  oDict = await browser.runtime.sendMessage({request: 'getODict'});
  await parsePage();
}

async function parsePage() {
  if (!content) {
    console.log("parsePage() called without content set");
    return;
  }

  var temp = $(content).clone();
  temp.find("rt").remove();
  text = temp[0].textContent;

  // Try to find all the words in the text
  console.log("Parsing page for word breaks");
  findBreaks();

  content.addEventListener('click', textClicked, false);
}

// Find word breaks in text
async function findBreaks() {
  var result = await browser.runtime.sendMessage({request: 'findBreaks',
    text: text, forcedBreaks: forcedBreaks});
  words = result.words;
  breaks = result.breaks;
  uWords = result.uWords;
  oWords = result.oWords;

  // Clear previous tags
  clearMarking(content);

  console.log("Matching words against user dictionary...");
  uNodes = [];
  oNodes = [];
  for (var i = 0; i < breaks.length; i++) {
    var word = words[i];
    if (oWords.includes(i))
      oNodes.push(hlText(content.childNodes[0], breaks[i], word.length));
    else if (uWords.includes(i))
      uNodes.push(markText(content.childNodes[0], breaks[i], word.length));
  }
  console.log("\tDone");
}

async function reHighlightText(firstChange=0) {
  var marks = await browser.runtime.sendMessage({request: 'findMarkings',
    words: words, firstChange: firstChange, uWordsOld: uWords, oWordsOld: oWords});
  uWords = marks.uWords;
  oWords = marks.oWords;

  clearMarking(content, firstChange);

  for (var i of marks.uWords) {
    if (i < firstChange) continue;
    uNodes.push(markText(content.childNodes[0], breaks[i], words[i].length));
  }
  for (var i of marks.oWords) {
    if (i < firstChange) continue;
    oNodes.push(hlText(content.childNodes[0], breaks[i], words[i].length));
  }
}

async function addAllMarkedWords() {
  var nWordsPre = uDict.size;
  for (var i = 0; i < words.length; i++) {
    var dIndex = await dictIndex(words[i]);
    if (oDict.has(dIndex) == false)
      uDict.add(dIndex);
  }
  writeUDict();
  console.log("Added", uDict.size - nWordsPre, "words!");

  // Reflow words
  findBreaks();
}
document.addEventListener('keyup', e => {
  if (e.altKey && !e.shiftKey && e.keyCode == 90) addAllMarkedWords();
  // Search for new paragraph when Ctrl-Shift-Z is pressed
  if (e.altKey && e.shiftKey && e.keyCode == 90) {
    if (content) {
      searchingForDiv = true;
      clearMarking(content);
      content.removeEventListener('click', textClicked);
      content = null;
    }else {
      document.body.addEventListener('mousemove', highlightHover, false);
      document.body.addEventListener('click', selectContent, false);
    }
  }
}, false);

function isWord(word) {
  return browser.runtime.sendMessage({request: 'isWord', word: word}); }
function inDict(word) {
  return browser.runtime.sendMessage({request: 'inDict', word: word}); }
function dictIndex(word) {
  return browser.runtime.sendMessage({request: 'dictIndex', word: word}); }
async function writeUDict() {
  return browser.runtime.sendMessage({request: 'writeUDict', dict: [...uDict]}); }
async function writeODict() {
  return browser.runtime.sendMessage({request: 'writeODict', dict: [...oDict]}); }

async function textClicked(e) {
  e.stopPropagation();
  let range;

  // User clicked, toggle a forced break on this word and add it to the users dict
  //
  // If Ctrl is held, make the word yellow

  // Get selection
  var sel = document.getSelection();
  var textNode = sel.focusNode;
  if (textNode.parentNode.tagName === "RT") return;
  var offset = sel.focusOffset;
  var globalOffs = flatIndex(content, textNode, offset);
  var modifiedIndex = words.length; // Index of first changed word
  // Clear from a couple words before the clicked word, ensure we reflow correctly
  modifiedIndex = Math.min(breaks.indexOf(globalOffs)-9, modifiedIndex);
  modifiedIndex = Math.max(0, modifiedIndex);

  // If the user Ctrl clicked a word, add it to the unknown word dictionary
  if (e.ctrlKey) {
    // If this is in the middle of a word, add a forced break and make the word yellow
    if (breaks.includes(globalOffs) == false
          && forcedBreaks.includes(globalOffs) == false) {
      forcedBreaks.push(globalOffs);
      console.log("Add force break at", globalOffs);

      // Reflow words with the new break
      await findBreaks();
    }

    // Clear the word from uDict and add it to oDict
    var word = words[breaks.indexOf(globalOffs)];
    var base = await isWord(word);
    var dIndex = await dictIndex(word);
    if (word) {
      if (oDict.has(dIndex)) {
        oDict.delete(dIndex);
        await browser.runtime.sendMessage({request: 'removeOWord', index: dIndex});
        console.log("Remove", word, "("+base+")", "from oDict");
      }else {
        uDict.delete(dIndex);
        await browser.runtime.sendMessage({request: 'removeUWord', index: dIndex});
        oDict.add(dIndex);
        console.log("Add", word, "("+base+")", "to oDict");
      }
    }

    await writeODict();

  // If the user clicked a break
  // Toggle between adding it to uDict and removing it
  }else if (breaks.includes(globalOffs)) {
    var breakIndex = breaks.indexOf(globalOffs);
    var word = words[breakIndex];
    var base = await isWord(word);
    var dIndex = await dictIndex(word);
    if (uDict.has(dIndex)) {
      uDict.delete(dIndex);
      await browser.runtime.sendMessage({request: 'removeUWord', index: dIndex});
      console.log("Remove", word, "("+base+")", "from uDict");

      // Remove the forced break here if there is one
      forcedBreaks = forcedBreaks.filter(e => e !== globalOffs);
      console.log("Filter force break at", word, "("+base+")");
      findBreaks();

    }else {
      uDict.add(dIndex);
      oDict.delete(dIndex);
      await browser.runtime.sendMessage({request: 'removeOWord', index: dIndex});
      console.log("Add", word, "("+base+")", "to uDict");
      // clearMarkingWord(modifiedIndex);  // Clear this word only
      // modifiedIndex = words.length;     // avoids having to reprocess the text
    }

    await writeUDict();

  }else {
    // Otherwise, add this point as a forced break
    forcedBreaks.push(globalOffs);
    console.log("Add force break at", globalOffs);

    forcedBreaks.sort((a, b) => a - b);

    // Reflow words with the new break
    await findBreaks();
  }

  // Rehighlight every word in case the user dicts were changed
  if (modifiedIndex < words.length)
    reHighlightText(modifiedIndex);
}

function flatIndex(pNode, target, index) {
  // Find the position in the text of 'index' relative to the parent node

  var newIndex = 0;
  // Loop through the parent nodes children
  for (var i = 0; i < pNode.childNodes.length; i++) {
    var cNode = pNode.childNodes[i];

    if (cNode == target)
      return newIndex + index;

    if (!cNode.contains(target)) {
      var temp = $(cNode).clone();
      temp.find("rt").remove();
      newIndex += temp[0].textContent.length;
    }

    // if it does have target as child, recurse
    else return newIndex + flatIndex(cNode, target, index);
  }
}

function nextTextNode(node) {
  do {
    if (node.childNodes.length > 0            // Search child nodes
        && node.tagName!=="RT")               // Always skip <rt> furigana tags
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
  return hl;
}

function markText(node, start, len) { return addHl(node, start, len, 'jr-new'); }
function hlText(node, start, len) { return addHl(node, start, len, 'jr-hl'); }
function addHl(node, start, len, className) {
	// Only care about text nodes
	// list containing every text node to highlight
  var textNodes = [];
  var origNode = node;
  var hlNode = null;

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
    hlNode = addHlSpan(node, className);
    return [hlNode];
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
      hlNode = addHlSpan(textNodes[0], className);
      $(hlNode).addClass("jr-l"); // Also remove right border-radius
      var addedNodes = [hlNode];
      for (var i = 1; i < textNodes.length; i++) {
        hlNode = addHlSpan(textNodes[i], className);
        // Remove border-radius on both sides
        $(hlNode).addClass("jr-m");
        addedNodes.push(hlNode);
      }
      $(hlNode).removeClass("jr-m");
      $(hlNode).addClass("jr-r");
      origNode.normalize();
      return addedNodes;
    }
    len -= node.textContent.length;
  }
}
function clearMarking(node, fromIndex) {
  console.log("clearMarking");
  if (typeof fromIndex != "undefined") {
    console.log("Removing highlighted nodes after", fromIndex);
    for (var i = uWords.findIndex(e => e >= fromIndex); i < uNodes.length; i++) {
      $(uNodes[i]).contents().unwrap();
    }
    for (var i = uWords.findIndex(e => e >= fromIndex); i < oNodes.length; i++) {
      $(oNodes[i]).contents().unwrap();
    }
    uNodes = uNodes.slice(0, fromIndex);
    oNodes = oNodes.slice(0, fromIndex);
  }else {
    $(node).find(".jr-new").contents().unwrap();
    $(node).find(".jr-hl").contents().unwrap();
  }
  node.normalize();
}
function clearMarkingWord(index) {
    $(uNodes[index]).contents().unwrap();
}

