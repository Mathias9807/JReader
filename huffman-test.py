dictionary = ["mind","miss","mr","meal","huh"]

text = "mindmrmealhuhmissmind"

def longestWord(text, d):
    words = []
    textLeft = text
    i = 0
    while i < len(text):
        textLeft = text[i:]
        for m in range(min(len(textLeft), 5), 0, -1):
            print("Check:", i, ", ", m)
            if text[i:i+m] in d:
                words.append(text[i:i+m])
                i += m - 1
                break
        i += 1

    return words

class Node(dict):
    def __init__(self):
        self.text = ""

    def __str__(self):
        return str(dict(self, **self.__dict__))

def longestWordHuffman(text, d):
    # Make lookup structure
    root = Node()

    # Add each word
    for word in d:
        node = root

        # Iterate up each character of the word and add it if it doesn't exist
        chars = ""
        for c in word:
            chars += c
            if c in node:
                node = node[c]
            else:
                node[c] = Node()
                node[c].text = chars
                node = node[c]

    printTree(root)

    # Search from the first character and try to follow the trees nodes
    # to find the longest match
    i = 0
    while i < len(text):
        curNode = root
        word = ""
        j = 0
        while True:
            if i + j >= len(text) or text[i+j] not in curNode:
                # Skip to the next word
                i += len(word) - 1
                print(i,",",j)
                break
            else:
                char = text[i + j]
                word += char
                curNode = curNode[char]
                print(i,",",j)
            j += 1
        print(word)
        i += 1
    
    return root

def printTree(root, indent=0):
    print(' ' * indent + root.text)
    for n in root:
        printTree(root[n], indent + 1)

n = Node()
a = n
n[5] = 5
a[6] = 6
print("Test", n)

print(longestWordHuffman(text, dictionary))
