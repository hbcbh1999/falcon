var BLACKLIST = ['https://www.google.com/_/chrome/newtab'];
var LT = function(a,b) {return a < b};
var GT = function(a,b) {return a > b};
var LT_OBJ = function(a,b) {
    return a.time < b.time;
}

var GT_OBJ = function(a,b) {
    return a.time > b.time;
}

var MIN_KEYWORD_LEN = 3;

Array.max = function( array ){
    return Math.max.apply(Math,array);
};

chrome.omnibox.onInputChanged.addListener(omnibarHandler);
chrome.runtime.onMessage.addListener(handleMessage);

function init() {
    window.preloaded = [];
    window.memo = {};
    chrome.storage.local.get('index', function(items) {
        var obj = items['index'];
        if (obj === undefined) {
            window.timeIndex = [];
            chrome.storage.local.get(null, function(items) {
                for (var key in items) {
                    if (key != 'index') {
                        timeIndex.push(items[key].time.toString());
                    }
                }

                timeIndex.sort(function(a,b) {return a.time - b.time}); // soonest last
                makePreloaded(timeIndex);
                chrome.storage.local.set({'index':{'index':timeIndex}});
            });

        } else {
            window.timeIndex = obj.index;
            makePreloaded(timeIndex);
        }
    });
}

function makePreloaded(index) {
    var preloaded_index = [];
    var millis = +CUTOFF_DATE;
    var i = Math.floor(binarySearch(index, millis, LT, GT, 0, index.length));
    for (var j = i; j < index.length; j++) {
        preloaded_index.push(index[j]);
    }

    chrome.storage.local.get(preloaded_index, function(items) {
        window.preloaded = [];
        for (var key in items) {
            preloaded.push(items[key]);
        }

        preloaded.sort(function(a,b){return a.time-b.time});
    });
}

function assert(condition, message) {
    if (!condition) {
        throw message || "Assertion failed";
    }
}

function handleMessage(data, sender, sendRespones) {
    // data is from message
    if (data.msg === 'pageContent' && shouldArchive(data)) {
        delete data.msg;
        data.text = processPageText(data.text);
        var time = data.time;
        var keyValue = {};
        keyValue[time] = data;
        chrome.storage.local.set(keyValue, function() {
            console.log("Stored: " + data.title);
        });

        timeIndex.push(time.toString());
        preloaded.push(data);
        chrome.storage.local.set({'index':{'index':timeIndex}});
    }
}

function omnibarHandler(text, suggest) {
    dispatchSuggestions(text, function(suggestions, shouldDate) {
        var res = [];
        var i;
        for (i = 0; i < suggestions.length; i++) {
            var elem = suggestions[i];
            var description = "<url>" + escape(elem.url) + "</url> "
            if (shouldDate) {
                var date = new Date(elem.time);
                var fmt = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getUTCFullYear().toString().substring(2,4);
                description += ' on <match>' + escape(fmt) + '</match> ';
            }

            description += '- ' + escape(elem.title);
            res.push({content:elem.url, description:description});
        }

        suggest(res);
    });
}

function shouldArchive(data) {
    for (var url in BLACKLIST) {
        if (data.url.indexOf(url) > -1) return false;
    }

    return true;
}

function makeSuggestions(keywords, candidates, cb) {
    var res = [];
    var urls = {};
    var keywordsLen = keywords.length;
    var j = 0;
    for (var i = candidates.length - 1; i > -1; i--) {
        var text = candidates[i].text;
        var isMatching = true;
        for (var k = 0; k < keywordsLen; k++) {
            if (text.indexOf(keywordsLen[k]) === -1) {
                isMatching = false;
                break;
            }
        }

        if (isMatching && !(candidates[i].url in urls)) {
            res.push(candidates[i]);
            urls[candidates[i].url] = true;
            j += 1;
            if (j === 5) {
                break;
            }
        }
    }

    cb(res);
}

function dispatchSuggestions(text, cb) {
    var query = makeQueryFromText(text);
    query.text = text;
    if (query.before !== false && query.after !== false && query.after >= query.before) return;

    if (Array.max(query.keywords.map(function(x){return x.length})) < MIN_KEYWORD_LEN) {
        return;
    }

    query.keywords = query.keywords.filter(function(x) {return x.length >= MIN_KEYWORD_LEN});
    query.keywords.sort(function(a,b){return b.length-a.length});

    if (query.after >= CUTOFF_DATE) {
        var start = Math.floor(binarySearch(preloaded, {'time':+query.after}, LT_OBJ,
                                            GT_OBJ, 0, preloaded.length));
        var end;
        if (query.before) {
            end = Math.ceil(binarySearch(preloaded, {'time':+query.before}, LT_OBJ,
                                         GT_OBJ, 0, preloaded.length));
        } else {
            end = preloaded.length;
        }

        makeSuggestions(query.keywords, preloaded.slice(start, end), cb)
    } else {
        var start = Math.floor(binarySearch(timeIndex, +query.after, LT,
                                            GT, 0, timeIndex.length));
        var end;
        if (query.before) {
            end = Math.ceil(binarySearch(timeIndex, +query.before, LT,
                                         GT, 0, timeIndex.length));
        } else {
            end = timeIndex.length;
        }

        chrome.storage.local.get(timeIndex.slice(start, end), function(items) {
            makeSuggestions(query.keywords, items, cb);
        });
    }
}

function binarySearch(arr, value, lt, gt, i, j) {
    if (Math.abs(j - i) <= 1) {
        return (i + j)/2;
    }
    
    var m = Math.floor((i + j)/2)
    var cmpVal = arr[m];
    if (gt(cmpVal, value)) {
        j = m;
    } else if (lt(cmpVal, value)){
        i = m;
    } else {
        return m;
    }
    return binarySearch(arr, value, lt, gt, i, j);
}

init();
