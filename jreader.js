var content = null;
var text = "";
var searchingForDiv = false;
var closingPopup = false;

var forcedBreaks = [];
var breaks = [];
var words = [];
var indices = [];

var uDict, oDict, uWords, oWords;
var uNodes = [], oNodes = [];

// clearMarking(document.body);

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

  addTooltip(content);

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
  console.log("Process text");
  var result = await browser.runtime.sendMessage({request: 'findBreaks',
    text: text, forcedBreaks: forcedBreaks});
  console.log("        Done");
  words = result.words;
  indices = result.indices;
  breaks = result.breaks;
  uWords = result.uWords;
  oWords = result.oWords;

  // Clear previous tags
  clearMarking(content);
  updateTooltip();

  console.log("Matching words against user dictionary...");
  uNodes = [];
  oNodes = [];
  var start = performance.now();

  var oBreaks = [], uBreaks = [], oLengths = [], uLengths = [];
  for (var i of uWords) {
      uBreaks.push(breaks[i]); uLengths.push(words[i].length);
  }
  for (var i of oWords) {
      oBreaks.push(breaks[i]); oLengths.push(words[i].length);
  }
  oNodes.push(...hlTexts(content.childNodes[0], oBreaks, oLengths));
  uNodes.push(...markTexts(content.childNodes[0], uBreaks, uLengths));

  console.log("\tDone in " + (performance.now() - start) + "ms");
}

async function reHighlightText(firstChange=0) {
  var marks = await browser.runtime.sendMessage({request: 'findMarkings',
    words: words, firstChange: firstChange, uWordsOld: uWords, oWordsOld: oWords});
  uWords = marks.uWords;
  oWords = marks.oWords;

  clearMarking(content, firstChange);

  console.log("Matching words against user dictionary...");
  var start = performance.now();

  var oBreaks = [], uBreaks = [], oLengths = [], uLengths = [];
  for (var i of uWords) {
    uBreaks.push(breaks[i]); uLengths.push(words[i].length);
  }
  uNodes.push(...markTexts(content.childNodes[0], uBreaks, uLengths));
  for (var i of oWords) {
    oBreaks.push(breaks[i]); oLengths.push(words[i].length);
  }
  oNodes.push(...hlTexts(content.childNodes[0], oBreaks, oLengths));
  console.log("\tDone in " + (performance.now() - start) + "ms");
}

async function addAllMarkedWords() {
  var nWordsPre = uDict.size;
  for (var i = 0; i < words.length; i++) {
    var dIndex = await dictIndex(words[i]);
    if (oDict.has(dIndex) == false)
      uDict.add(dIndex);
  }
  writeUDict();

  var newWords = uDict.size - nWordsPre;
  console.log("Added", newWords, "words!");

  floatMessage("Added " + newWords + " word" + (newWords==1 ? '' : 's'));

  // Reflow words
  findBreaks();
}

function closePopup() {
  searchingForDiv = true;
  clearMarking(content);
  clearTooltip();
  content.removeEventListener('click', textClicked);
  content = null;
}

document.addEventListener('keyup', e => {
  if (e.altKey && !e.shiftKey && e.keyCode == 90) {
    addAllMarkedWords();
    closePopup();
  }
  // Search for new paragraph when Alt-Shift-Z is pressed
  if (e.altKey && e.shiftKey && e.keyCode == 90) {
    if (content) {
      closePopup();
    }else {
      browser.runtime.sendMessage({request: 'start'});
      document.body.addEventListener('mousemove', highlightHover, false);
      document.body.addEventListener('click', selectContent, false);
    }
  }
  if (e.keyCode == 27) { // If escape is pressed, abort select operation
    document.body.removeEventListener("mousemove", highlightHover);
    document.body.removeEventListener("click", selectContent);
    if (prevElement!= null) {prevElement.classList.remove("jr-hover");}
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
  if (e.altKey) {
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
    console.log("Wrote uDict updates");

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
    await reHighlightText(modifiedIndex);
  updateTooltip();
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

function markTexts(node, start, len) { return addHls(node, start, len, 'jr-new'); }
function hlTexts(node, start, len) { return addHls(node, start, len, 'jr-hl'); }
// Highlight the given spans of text starting from node
// Takes as params the starting node, an array of start indices and
// an accompanying array of text lengths.
// Returns an array of arrays containing all newly created span elements
// (may be more than one if text spans element boundaries)
function addHls(node, starts, lens, className) {
  var origNode = node;
  var hlNode = null;
  var outputNodes = [];

  // Sort the starts and lens arrays according to start index
  starts.map((v, i) => ({a: v, b: lens[i]}))
      .sort((a, b) => a.a - b.a)
      .forEach((v, i) => { starts[i] = v.a; lens[i] = v.b; });

  // Loop through each highlight that should be added
  var cursor = 0; // Index of current node
  for (var i = 0; i < starts.length; i++) {
    var start = starts[i];
    var len = lens[i];

	  // Go from the starting node and step to the text node containing the 'start' text
    if (node.nodeType !== Node.TEXT_NODE) node = nextTextNode(node);
    while (start - cursor >= node.textContent.length) {
      cursor += node.textContent.length;
      node = nextTextNode(node);
    }

	  // Split that node if start is in the middle of the text
    if (start - cursor > 0) {
      node = node.splitText(start - cursor);
      cursor = start; // Realign cursor to the next node
    }
	  // Split end if string ends in this node too
    if (len < node.textContent.length) node.splitText(len);
    if (len <= node.textContent.length) {
	    // If so, highlight that node and return here
      hlNode = addHlSpan(node, className);
      outputNodes.push([hlNode]);
      node = hlNode.childNodes[0];
      continue;
    }

	  // Only care about text nodes
	  // list containing every text node to highlight
    var textNodes = [];

	  // Add this first text node to list
    textNodes.push(node);

    // Text overflowed the text node, go to next text node
    len -= node.textContent.length;
    cursor += node.textContent.length;
	  while (node = nextTextNode(node)) {
      textNodes.push(node); // Add every next node until we reach end of text

	    // Split end if string ends in this node
      if (len <= node.textContent.length) {
        if (len < node.textContent.length) node.splitText(len);

	      // If so, highlight every node in list and return
        hlNode = addHlSpan(textNodes[0], className);
        $(hlNode).addClass("jr-l"); // Also remove right border-radius
        var addedNodes = [hlNode];
        for (var j = 1; j < textNodes.length; j++) {
          hlNode = addHlSpan(textNodes[j], className);
          // Remove border-radius on both sides
          $(hlNode).addClass("jr-m");
          addedNodes.push(hlNode);
        }
        $(hlNode).removeClass("jr-m");
        $(hlNode).addClass("jr-r");
        origNode.normalize();
        outputNodes.push(addedNodes);
        node = hlNode.childNodes[0];
        break;
      }
      len -= node.textContent.length;
      cursor += node.textContent.length;
    }
  }

  return outputNodes;
}

function clearMarking(node, fromIndex) {
  console.log("clearMarking");
  if (node == null) return;

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
  console.log("        Done");
}
function clearMarkingWord(index) {
    $(uNodes[index]).contents().unwrap();
}

// Add word percentage tooltip to node
function addTooltip(node) {
  clearTooltip();
  closingPopup = false;

  // Check if overflow: hidden on node, if so then floatMessages will get cut-off
  // Anchor the tooltip to the first parent without overflow: hidden
  // We only search up 4 levels
  var hNode = node;
  for (var i = 0; i < 4; i++) {
    if (hNode.parentNode.nodeName === "BODY") break;
    if ($(hNode).css('overflow') == 'hidden') node = hNode.parentNode;

    hNode = hNode.parentNode;
  }

  $(node).append(`
  <span id="jr-tooltip">
    <img id="jr-check" src="${browser.runtime.getURL("check.svg")}" alt="Accept selection">
    <span>?%</span> <span>?%</span>
    <img id="jr-close" src="${browser.runtime.getURL("close.svg")}" alt="Close selection">
    <span class="jr-hoverText">Loading...</span>
  </span>
  `);

  $(node).addClass('jr-ttParent');
  $('#jr-check').on('click', async function(e) {
    e.stopPropagation();
    await addAllMarkedWords();
    closePopup();
  });
  $('#jr-close').on('click', function(e) {
    e.stopPropagation();
    closePopup();
  });

  // Check if the tooltip's position is outside of the webpage
  // If so, move it inside
  var bodyRect = document.body.getBoundingClientRect(),
    tooltipRect = document.getElementById('jr-tooltip').getBoundingClientRect(),
    offset = tooltipRect.top - bodyRect.top;
  console.log(bodyRect, tooltipRect, offset);
  if (offset < 0) $('#jr-tooltip').css('top', '0');
}
function updateTooltip() {
  var tooltip = document.getElementById('jr-tooltip');
  if (tooltip) {
    // Get all unique words in this text - uDict and oDict
    var w = new Set([...indices]);
    var wMinusU = new Set([...w].filter(word => !uDict.has(word) && !oDict.has(word)));
    var wMinusO = new Set([...w].filter(word => oDict.has(word) == true));
    tooltip.childNodes[3].textContent = Math.round(100*wMinusU.size/w.size) + '%';
    tooltip.childNodes[5].textContent = Math.round(100*wMinusO.size/w.size) + '%';

    // Write number of words into tooltip hovertext
    tooltip.childNodes[9].innerHTML = `${wMinusU.size} new / ${wMinusO.size} ylw / ${w.size} unique<br>${uWords.length} new / ${oWords.length} ylw / ${indices.length} total`;
  }
}
function clearTooltip() {
  var floatText = $('#jr-tooltip').siblings('.floatAway');

  if (floatText.length == 0) {
    $('#jr-tooltip').remove();
    $('.jr-ttParent').removeClass('jr-ttParent');
    closingPopup = false;
  }else {
    $('#jr-tooltip').css('display', 'none');
    closingPopup = true;
  }
}
function floatMessage(msg) {
  var tooltip = document.getElementById('jr-tooltip');
  if (!tooltip) tooltip = content;
  console.log(tooltip);
  if (!tooltip) return;

  // Add "background: #FFF" with as low specificity as possible as a backup for
  // mix-blend-mode. If a website doesn't set a background the default of rgba(0,0,0,0)
  // would be used which would make the floatAway text invisible.
  if ($('body').css('background-color') === 'rgba(0, 0, 0, 0)')
    $('body').addClass('jr-white');

  var floatAway = $('<span class="floatAway">' + msg + '</span>').insertAfter(tooltip);
  floatAway.on('animationend', function() {
    floatAway.remove();
    $('body').removeClass('jr-white');

    // Close the popup if this float text was preventing it from closing before
    if (closingPopup) {
      $('#jr-tooltip').remove();
      $('.jr-ttParent').removeClass('jr-ttParent');
      closingPopup = false;
    }
  });
}

