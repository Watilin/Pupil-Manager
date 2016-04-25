// ==UserScript==
// @name          Pupil Manager
// @namespace     fr.kergoz-panic.watilin
// @description   Outil pour gérer l’envoi et la réception d’élèves dans Teacher-Story.
// @version       1.3
//
// @author        Watilin
// @license       GPLv2; http://www.gnu.org/licenses/old-licenses/gpl-2.0.txt
// @supportURL    https://github.com/Watilin/Pupil-Manager/issues
//
// @icon          https://raw.githubusercontent.com/Watilin/Pupil-Manager/master/icon.png
// @downloadURL   https://raw.githubusercontent.com/Watilin/Pupil-Manager/master/Pupil_Manager.user.js
// @updateURL     https://raw.githubusercontent.com/Watilin/Pupil-Manager/master/Pupil_Manager.meta.js
//
// @include       http://teacher-story.com/*
// @connect       self
// @connect       twinoid.com
// @nocompat
// @noframes
//
// @grant         GM_xmlhttpRequest
// @grant         GM_getResourceText
// @grant         GM_getResourceURL
// @grant         GM_getValue
// @grant         GM_setValue
//
// @resource      ui-html           ui.html
// @resource      ui-style          ui.css
// @resource      artwork           artwork.png
// ==/UserScript==

"use strict";

/* Table of Contents: use Ctrl+F and start with @, e.g. @DAT
 * [SHI] Shims for Retarded Browsers
 * [CST] Constants
 * [DAT] Data Retrieval
 * [UIM] UI Injection & Manipulation
 * [INP] Incoming Pupils Management
 * [DEV] Development & Debug
 * [RUN] Run That Script!
 */

// [@SHI] Shims for Retarded Browsers //////////////////////////////////

[ "slice", "forEach", "map", "filter", "some", "every", "reduce" ]
  .forEach(function (methodName) {
    if (!(methodName in Array)) {
      Array[methodName] = function (iterable, callback, context) {
        return Array.prototype[methodName]
          .call(iterable, callback, context);
      };
    }
  });

if (!("contains" in String.prototype)) {
  String.prototype.contains = function contains(sub) {
    return this.indexOf(sub) >= 0;
  };
}

if (!("startsWith" in String.prototype)) {
  String.prototype.startsWith = function startsWith(sub) {
    return 0 === this.indexOf(sub);
  };
}

if (!("endsWith" in String.prototype)) {
  String.prototype.endsWith = function endsWith(sub) {
    return this.indexOf(sub) === this.length - sub.length;
  };
}

// [@CST] Constants ////////////////////////////////////////////////////

const StatusStrings = {
  "ok"            : "ok",
  "alreadySent"   : "a déjà un élève",
  "maxedOut"      : "a atteint le max",
  "friendsOnly"   : "que les amis",
  "noMorePupils"  : "plus d’élèves",
  "unknownPlayer" : "joueur inconnu",
  "error"         : "raison inconnue",
  "networkError"  : "erreur réseau"
};

const GMVALUE_LAST_EVENT_ID = "lastEventId";
const GMVALUE_LAST_EVENT_TIME = "lastEventTime";
const GMVALUE_NON_CONTACT_PLAYERS = "nonContactPlayers";

// [@DAT] Data Retrieval ///////////////////////////////////////////////

function getTid() {
  return unsafeWindow._tid.session.tid;
}

function requestContacts(callback) {
  var params = [
    "name=u",
    "siteHost=teacher-story.com",
    "host=teacher-story.com",
    "lang=fr",
    "jsm=1",
    "sid=" + unsafeWindow._tid.session.sid
  ].join(";");

  GM_xmlhttpRequest({
    method: "GET",
    url: "http://twinoid.com/mod/searchContacts?" + params,
    onerror: logRequestError,

    onload: function (response) {
      console.log("GM request successful (code %d)", response.status);
      var text = response.responseText;
      var match =
        text.match(/<div class="searchContacts">(?:.|\s)*<\/div>/);
      if (match) {
        var html = match[0]
          .replace(/\\r\\n/g, "")
          .replace(/src="\/\//g, "src=\"http://");
        callback.call(response, html);
      } else {
        console.log("unexpected server response");
        expose(text, "serverResponse");
      }
    }
  });
}

var contactIds = {};

function parseContacts(html) {
  var $div = document.createElement("div");
  $div.insertAdjacentHTML("afterbegin", html);
  var $contacts = $div.querySelector(".searchContacts");

  var contacts = [];
  var isFriend = true;
  var tidDataRegexp = /^([^\/]+)\/(\d+)$/;

  var nonContacts = JSON.parse(GM_getValue(GMVALUE_NON_CONTACT_PLAYERS, "[]"));
  console.log("nonContacts", nonContacts);

  var $elt;
  while ($elt = $contacts.firstElementChild) {
    switch ($elt.className) {
      case "select friend":
        var match = $elt.getAttribute("tid_data").match(tidDataRegexp);
        var name = match[1];
        var id = parseInt(match[2], 10);
        var $avatar = $elt.querySelector(".avatarImg");
        contacts.push({
          id       : id,
          name     : name,
          isFriend : isFriend,
          avatar   : $avatar && $avatar.src
        });
        contactIds[name] = id;

        // remove a nonContact when found in the contacts
        for (var i = nonContacts.length; i--; ) {
          if (nonContacts[i].id === id) {
            nonContacts.splice(i, 1);
            break;
          }
        }
        break;

      case "sep":
        if ($elt.textContent.contains("Mes contacts")) {
          isFriend = false;
        }
        break;

      case "small": break;

      default:
        console.warn("case %s not handled", $elt.className);
    }
    $elt.remove();
  }
  contacts = contacts.concat(nonContacts);

  // do not put nonContacts names into contactIds, as these names
  // may not be up-to-date

  GM_setValue(GMVALUE_NON_CONTACT_PLAYERS, JSON.stringify(nonContacts));
  return contacts;
}

// [@UIM] UI Injection & Manipulation //////////////////////////////////

function injectUIStyle() {
  var $link = document.createElement("link");
  $link.rel = "stylesheet";
  $link.type = "text/css";
  $link.href = GM_getResourceURL("ui-style");
  document.head.appendChild($link);
  return $link;
}

function injectUIBox(nPupils) {
  var $ui = document.createElement("div");
  $ui.id = "pupil-manager";
  $ui.style.display = "none";
  $ui.insertAdjacentHTML("afterbegin", GM_getResourceText("ui-html"));

  var $artwork = $ui.querySelector(".artwork img");
  $artwork.src = GM_getResourceURL("artwork");

  var $pupils = $ui.querySelector(".pupils-to-send");
  if (!nPupils) {
    $pupils.textContent = "Il ne vous reste aucun élève à envoyer aujourd’hui.";
    $ui.classList.add("no-more-pupils");
  } else {
    $pupils.querySelector("strong").textContent = nPupils +
      (nPupils > 1 ? " élèves" : " élève");
  }

  fillContactTable($ui);

  Array.forEach($ui.querySelectorAll(".close-button"),
    function ($button) {
      $button.addEventListener("click", function (event) {
        event.preventDefault();
        $ui.style.display = "none";
      });
    });

  document.addEventListener("keydown", function (event) {
    if (KeyEvent.DOM_VK_ESCAPE === event.keyCode &&
        $ui.style.display !== "none") {
      event.preventDefault();
      $ui.style.display = "none";
    }
  });

  var $content = document.querySelector(".content");
  $content.parentNode.insertBefore($ui, $content.nextSibling);

  return $ui;
}

function injectUIButton() {
  var $button = document.createElement("a");
  $button.id = "pupil-manager-button";
  $button.textContent = "Pupil Manager";
  $button.href = "#";

  var $refButton;
  var nPupils = 0;
  var $container;
  var className = "";

  var caseGame = function caseGame() {
    $refButton = document.querySelector("#gameInfos .smallButton");
    if ($refButton) {
      nPupils = $refButton.onmouseover.toString()
        .match(/<strong>(\d)/)[1];
      $container = $refButton.parentElement;
    } else {
      $container = document.querySelector("#gameInfos");
    }
    className = "button smallButton";
  };

  var caseTeacher = function caseTeacher() {
    $refButton = document.querySelector(".banner .button");
    if ($refButton) {
      nPupils = parseInt(
        document.querySelector(".banner strong").textContent, 10);
      $container = $refButton.parentElement;
      className = "button mediumButton";
    }
    // doesn’t inject when no ref button was found
  };

  switch (location.pathname) {
    case "/":
    case "/game":
      caseGame();
      break;

    case "/teacher":
    case "/ranks":
    case "/help":
    case "/game/victory":
    case "/game/chooseMission":
    case "/levelUp":
      caseTeacher();
      break;

    case "/tid/forum":
    case "/game/results":
    case "/game/victory":
      // doesn’t inject Pupil Manager when the page has no regular
      // “send student” button
      return;

    default:
      if (location.pathname.startsWith("/teacher/")) {
        caseTeacher();
      } else {
        throw "not implemented for " + location.pathname;
      }
  }

  if ($container) {
    $button.className = className;
    $container.appendChild(document.createTextNode(" "));
    $container.appendChild($button);

    var $ui;
    $button.addEventListener("click", function (event) {
      event.preventDefault();
      if (!$ui) $ui = injectUIBox(nPupils);
      $ui.style.display = "";
      window.scrollTo(0, 0);
    });
  }

  return $button;
}

function fillContactTable($container) {
  requestContacts(function (html) {
    var $table = $container.querySelector(".contacts table");

    var $pagination = $container.querySelector(".pagination");
    var buttons = [];
    var activePage;

    var $$sortables = $container.getElementsByClassName("sortable");
    Array.forEach($$sortables, function ($sortable) {
      $sortable.addEventListener("click", function () {
        Array.forEach($$sortables, function($) {
          $.classList.remove("sort");
        });

        var criterion = this.dataset.sortBy;
        var direction =
          this.classList.contains("asc") ? "desc" : "asc";
        if ("asc" === direction) {
          this.classList.remove("desc");
          this.classList.add("asc");
        } else {
          this.classList.remove("asc");
          this.classList.add("desc");
        }
        this.classList.add("sort");

        sortContactTable($table, criterion, direction);
        $pagination.querySelector(".active").classList.remove("active");
        buttons[0].classList.add("active");
        activePage = 1;
      });
    });

    var $modelRow = $container.querySelector(".contacts tr.model");
    $modelRow.remove();
    $modelRow.classList.remove("model");

    var $tbody;

    var contacts = parseContacts(html);
    /* Contact structure in storage:
      key: {string} <userId>-<contactId> (example: "378517-1355707")
      {
        sent:         {unsigned int}
        lastSent:     {timestamp}
        received:     {unsigned int}
        lastReceived: {timestamp} | -1
        status:       {enum("ok", "alreadySent", "maxedOut", "friendsOnly",
                            "noMorePupils", "unknownPlayer", "error")}
      }
      A -1 for lastReceived means that data is present but the date is
      unknown.
    */
    contacts.forEach(function (contact, i) {
      if (!(i % 10)) $tbody = $table.createTBody();
      $tbody.style.display = "none";

      var $row = $modelRow.cloneNode(true);
      $tbody.appendChild($row);

      var $picCell          = $row.querySelector(".pic");
      var $nameCell         = $row.querySelector(".name");
      var $friendCell       = $row.querySelector(".friend");

      var $receivedCell     = $row.querySelector(".received");
      var $lastReceivedCell = $row.querySelector(".last-received");

      var $sentCell         = $row.querySelector(".sent");
      var $lastSentCell     = $row.querySelector(".last-sent");
      var $statusCell       = $row.querySelector(".status");
      var $actionCell       = $row.querySelector(".action");

      if (contact.avatar) {
        var $img = new Image();
        $img.alt = "";
        $img.width = 16;
        $img.height = 16;
        $img.src = contact.avatar;
        $picCell.appendChild($img);
      }
      $nameCell.textContent = contact.name;

      // U+2665 = ❤ black heart suit
      $friendCell.textContent = contact.isFriend ? "\u2665" : "";

      if (contact.isNonContact) {
        // U+2661 = ♡ white heart suit
        $friendCell.textContent = "\u2661";
        $friendCell.title = "Ce joueur ne fait pas partie de vos contacts";
      }

      var contactKey = getTid() + "-" + contact.id;
      var contactInfo = JSON.parse(GM_getValue(contactKey, "null"));

      if (contactInfo && contactInfo.status) {
        $sentCell.textContent = contactInfo.sent;
        updateDateCell($lastSentCell, contactInfo.lastSent);
        updateStatusCell($statusCell, contactInfo.status);
      } else {
        $sentCell.textContent =     "–";
        $lastSentCell.textContent = "–";
        $statusCell.textContent =   "–";
      }

      if (contactInfo && contactInfo.received) {
        $receivedCell.textContent = contactInfo.received;
        updateDateCell($lastReceivedCell, contactInfo.lastReceived);
      } else {
        $receivedCell.textContent = "–";
        $lastReceivedCell.textContent = "–";
      }

      var $pupilsLeft =
        $container.querySelector(".pupils-to-send strong");
      $actionCell.querySelector(".send-now").addEventListener("click",
        function (event) {
          event.preventDefault();

          var $button = this;
          if ($button.classList.contains("used")) return;
          if ($container.classList.contains("no-more-pupils")) return;
          $button.textContent = "…";

          var params = [
            "chk=" + document.querySelector("input[name=chk]").value,
            "o=-1",
            "u_name=" + contact.name,
            "u=" + contact.id
          ].join("&");
          GM_xmlhttpRequest({
            method: "GET",
            url: "/sendStudent?" + params,
            onerror: function (resp) {
              $button.textContent = "Réessayer";
              $button.classList.add("retry");
              updateStatusCell($statusCell, "networkError");
              logRequestError(resp);
            },

            onload: function (response) {
              $button.classList.remove("retry");

              var contactKey = getTid() + "-" + contact.id;
              var contactInfo = JSON.parse(GM_getValue(contactKey, "{}"));
              if (!contactInfo.sent) contactInfo.sent = 0;

              var now = Date.now();
              contactInfo.lastSent = now;
              updateDateCell($lastSentCell, now);

              if (response.finalUrl.endsWith("/teacher")) { // failure

                var text = response.responseText;
                var status;
                var reasons = {
                  "a déjà un élève à votre nom" : "alreadySent",
                  "a atteint le maximum"        : "maxedOut",
                  "que les élèves de ses amis"  : "friendsOnly",
                  "avez envoyé le maximum"      : "noMorePupils",
                  "joueur inconnu"              : "unknownPlayer",
                };
                for (var r in reasons) if (text.contains(r)) {
                  status = reasons[r];
                  break;
                }
                if (status) {
                  $button.textContent = "Échec";
                  $button.classList.add("failure", "used");
                } else {
                  status = "error";
                  expose(text, "raisonInconnue");
                  $button.textContent = "Réessayer";
                  $button.classList.add("retry");
                }
                updateStatusCell($statusCell, status);
                contactInfo.status = status;

                highlightUpdate($lastSentCell, $statusCell, $actionCell);

              } else { // success

                contactInfo.sent++;
                contactInfo.status = "ok";
                updateStatusCell($statusCell, "ok");
                $button.textContent = "Ok\xA0!";
                $button.classList.add("success", "used");
                var nPupils = parseInt($pupilsLeft.textContent, 10) - 1;
                if (nPupils) {
                  $pupilsLeft.textContent = nPupils +
                  (nPupils > 1 ? " élèves" : " élève");
                } else {
                  $pupilsLeft.previousSibling.data = "Il ne vous reste ";
                  $pupilsLeft.textContent = "aucun élève";
                  $container.classList.add("no-more-pupils");
                }

                highlightUpdate(
                  $sentCell, $lastSentCell, $statusCell, $actionCell);

              }
              $sentCell.textContent = contactInfo.sent;
              GM_setValue(contactKey, JSON.stringify(contactInfo));
              console.log("contact info saved (sending pupil)");
            }
          });
        });
    });

    var $$tbodies = $table.getElementsByTagName("tbody");

    /* This is a very interesting use case of getElementsByTagName
      versus querySelectorAll: even when tbodies are later replaced,
      the $$tbodies collection manages to correctly map the new tbodies.
      Therefore, there is no need to update pagination links.
      This is because getElementsByTagName returns a *live* collection,
      whereas querySelectorAll returns a *static* one.
    */

    var nPages = Math.ceil(contacts.length / 10);
    if (nPages < 2) $pagination.style.display = "none";
    else {
      for (var i = 1; i <= nPages; i++) (function (i) {
        var $pageButton = document.createElement("a");
        $pageButton.href = "#";
        $pageButton.textContent = i;

        $pageButton.addEventListener("click", function (event) {
          event.preventDefault();

          $$tbodies[activePage - 1].style.display = "none"; // magic here
          buttons[activePage - 1].classList.remove("active");

          $$tbodies[i - 1].style.display = ""; // and here
          buttons[i - 1].classList.add("active");
          activePage = i;
        });

        buttons.push($pageButton);
        $pagination.appendChild($pageButton);
        if (i < nPages) {
          $pagination.appendChild(document.createTextNode(" - "));
        }
      }(i));

      var $prevButton = document.createElement("a");
      $prevButton.href = "#";
      $prevButton.textContent = "<";
      $prevButton.title = "Page précédente";
      $prevButton.className = "relative";
      $prevButton.addEventListener("click", function (event) {
        event.preventDefault();
        if (activePage < 2) return;

        $$tbodies[activePage - 1].style.display = "none";
        buttons[activePage - 1].classList.remove("active");

        activePage--;
        $$tbodies[activePage - 1].style.display = "";
        buttons[activePage - 1].classList.add("active");
      });
      $pagination.insertBefore($prevButton, buttons[0]);

      var $nextButton = document.createElement("a");
      $nextButton.href = "#";
      $nextButton.textContent = ">";
      $nextButton.title = "Page suivante";
      $nextButton.className = "relative";
      $nextButton.addEventListener("click", function (event) {
        event.preventDefault();
        if (activePage >= nPages) return;

        $$tbodies[activePage - 1].style.display = "none";
        buttons[activePage - 1].classList.remove("active");

        activePage++;
        $$tbodies[activePage - 1].style.display = "";
        buttons[activePage - 1].classList.add("active");
      });
      $pagination.appendChild($nextButton);

      buttons[0].classList.add("active");
      activePage = 1;
    }

    $table.style.display = "";
    $table.querySelector("tbody").style.display = "";
    $container.querySelector(".loading").style.display = "none";
  });
}

function sortContactTable($table, criterion, direction) {
  // 1. retrieve all rows and push them into an array
  var rows = Array.slice($table.querySelectorAll("tbody tr"));

  // 2. remove all tbodies
  Array.forEach($table.querySelectorAll("tbody"),
    function ($tbody) { $tbody.remove(); });

  // 3. sort rows
  var sign = "asc" === direction ? 1 : -1;

  // this is a homebrew mix of some western european collations
  var collationRx =
    /([áàâäæãå]+)|([éèêëẽ]+)|([íìîïĩ]+)|([óòôöœõø]+)|([úùûüũ]+)|([ýỳŷÿỹ]+)|([ç]+)|([ñ]+)|([ð]+)|([ß]+)|([þ]+)|([ĳ]+)/g;
  var collationFn = function (_, a, e, i, o, u, y, c, n, d, ss, th, ij) {
    if (a) return "a".repeat(a.length);
    if (e) return "e".repeat(e.length);
    if (i) return "i".repeat(i.length);
    if (o) return "o".repeat(o.length);
    if (u) return "u".repeat(u.length);
    if (y) return "y".repeat(y.length);
    if (c) return "c".repeat(c.length);
    if (n) return "n".repeat(n.length);
    if (d) return "d".repeat(d.length);
    if (ss) return "ss".repeat(ss.length);
    if (th) return "th".repeat(th.length);
    if (ij) return "ij".repeat(ij.length);
  };
  rows.sort(function ($rowA, $rowB) {
    var diff;
    var $cellA = $rowA.querySelector("." + criterion);
    var $cellB = $rowB.querySelector("." + criterion);
    var a, b;
    if ("last-sent" === criterion) {
      a = $cellA.dataset.timestamp || 0;
      b = $cellB.dataset.timestamp || 0;
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
    } else {
      a = $cellA.textContent;
      b = $cellB.textContent;
      if ("–" === a && "–" === b) return 0;
      if ("–" === a) return 1;
      if ("–" === b) return -1;
    }
    if (!isNaN(a) && !isNaN(b)) { // numeric comparison
      diff = parseInt(a, 10) - parseInt(b, 10);
    } else { // lexical comparison
      a = a.toLowerCase().replace(collationRx, collationFn);
      b = b.toLowerCase().replace(collationRx, collationFn);
      diff = a < b ? -1 : a > b ? 1 : 0;
    }
    return sign * diff;
  });

  // 4. insert rows in new tbodies by groups of 10
  var $tbody;
  rows.forEach(function ($row, i) {
    if (!(i % 10)) $tbody = $table.createTBody();
    $tbody.style.display = "none";
    $tbody.appendChild($row);
  });
  $table.querySelector("tbody").style.display = "";
}

function updateDateCell($cell, timestamp) {
  if (-1 === timestamp) {
    $cell.textContent = "?";
    $cell.title = "Date inconnue";
  } else {
    var date = new Date(timestamp);
    var diff = (Date.now() - date) / 1000;
    $cell.textContent =
      (diff < 60)        ? "< 1\xA0min" :
      (diff < 3600)      ? Math.floor(diff / 60) + "\xA0min":
      (diff < 86400)     ? Math.floor(diff / 3600) + "\xA0h" :
      (diff < 3 * 86400) ? Math.floor(diff / 86400) + "\xA0j" :
      date.toLocaleDateString().replace(/\D\d{4}|\d{4}\D/, "");
    $cell.title = date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }
  $cell.dataset.timestamp = timestamp;
}

function updateStatusCell($cell, status) {
  $cell.textContent = StatusStrings[status];
}

function highlightUpdate($elem) {
  if (arguments.length > 1) {
    Array.forEach(arguments, function (arg) {
      highlightUpdate(arg);
    });
    return;
  }

  $elem.classList.remove("with-transition");
  requestAnimationFrame(function () {
    $elem.classList.add("updated");
    requestAnimationFrame(function () {
      $elem.classList.add("with-transition");
      $elem.classList.remove("updated");
    });
  });
}

// [@INP] Incoming Pupils Management ///////////////////////////////////

function watchIncomingPupils() {
  var _tid = unsafeWindow._tid;

  // hook fillSidePanel to retrieve panel content as soon as it loads
  var _f = _tid.fillSidePanel;
  _tid.fillSidePanel = exportFunction(function (side) {
    if (side !== "user") return _f.call(_tid, side);

    return exportFunction(function (html) {
      // load or refresh the panel’s content
      _f.call(_tid, side)(html);

      var $$events = document.querySelectorAll("#tid_eventList .tid_eventItem");
      var tsEvents = Array.filter($$events, function ($event) {
        var $title = $event.querySelector(".tid_title");
        return "Annonce Teacher Story" === $title.textContent.trim();
      }).map(function ($a) {
        var contactName = $a.querySelector(".tid_eventContent").lastChild.data
          .match(/(\S+?) vous a envoyé un nouvel élève/)[1];
        var eventId = parseInt($a.href.match(/\d+$/)[0], 10);
        var isRead = $a.classList.contains("tid_read_true");

        return {
          contactName : contactName,
          eventId     : eventId,
          isRead      : isRead
        };
      });
      processEventBatch(tsEvents);
    }, unsafeWindow);

  }, unsafeWindow);

  // trigger a load of the panel’s content
  _tid.loadJS("/bar/user/", cloneInto({}, unsafeWindow));
}

/**
 * @param eventBatch {array} [ {
 *    contactName: {string}
 *    eventId:     {unsigned int}
 *    isRead:      {boolean}
 *  }* ]
 */
function processEventBatch(eventBatch) {
  console.table(eventBatch);

  var lastEventId   = parseInt(GM_getValue(GMVALUE_LAST_EVENT_ID, 0), 10);
  var lastEventTime = parseInt(GM_getValue(GMVALUE_LAST_EVENT_TIME, 0), 10);
  console.log("lastEventId =%o\nlastEventTime =%o",
              lastEventId, lastEventTime);

  var maxEventId = 0;
  var now = Date.now();
  var nonContactPlayers =
    JSON.parse(GM_getValue(GMVALUE_NON_CONTACT_PLAYERS, "[]"));

  var updateReceivedStats = function (contactId) {
    var contactKey = getTid() + "-" + contactId;
    var contactInfo = JSON.parse(GM_getValue(contactKey, "{}"));

    var received = contactInfo.received || 0;
    contactInfo.received     = received + 1;
    contactInfo.lastReceived = lastEventTime ? now : -1;

    GM_setValue(contactKey, JSON.stringify(contactInfo));
    console.log("contact %c%s%c: info saved (side panel events)",
      "color: #FE7", contactId, "");
  };

  var nEvents = eventBatch.length;
  var countDownEvents = function countDownEvents() {
    nEvents--;
    if (nEvents > 0) return;

    GM_setValue(GMVALUE_LAST_EVENT_ID, maxEventId);
    GM_setValue(GMVALUE_LAST_EVENT_TIME, now);
    GM_setValue(GMVALUE_NON_CONTACT_PLAYERS, JSON.stringify(nonContactPlayers));
    console.log(
      "updated:\nlastEventId =%o\nlastEventTime =%o\nnonContactPlayers =%o",
      maxEventId, now, nonContactPlayers);
  };

  eventBatch.forEach(function (event) {
    maxEventId = Math.max(maxEventId, event.eventId);

    // making the assumption that event ids are strictly increasing
    if (event.eventId <= lastEventId) {
      countDownEvents();
      return;
    }

    console.log("%crequesting contact id for %s", "color: green", event.contactName);
    queryContactId(event.eventId, function (contactId, sorry) {
      if (!contactId) {
        console.warn(sorry);
        return;
      }

      console.log("%crequest for %s successful", "color: lime", event.contactName);
      if (!nonContactPlayers.some(function (ncp) {
            return ncp.id === contactId;
          })) {
        nonContactPlayers.push({
          id           : contactId,
          name         : event.contactName,
          isNonContact : true
        });
      }
      updateReceivedStats(contactId);
      countDownEvents();
    });
  });
}

function queryContactId(eventId, callback) {
  GM_xmlhttpRequest({
    method: "GET",
    url: "http://twinoid.com/ev/" + eventId,
    onerror: function (gmResp) {
      logRequestError(gmResp);
      callback(null, "network error");
    },
    onload: function (gmResp) {
      var match = gmResp.responseText.match(/\btid_id="(\d+)"/);
      if (!match) {
        callback(null, "parsing failed");
      } else {
        callback(parseInt(match[1], 10));
      }
    }
  });

}

// [@DEV] Development & Debug //////////////////////////////////////////

function logRequestError(resp) {
  console.warn("GM_xmlhttpRequest error: %d %s",
               resp.status,
               resp.statusText);
}

function expose(value, name) {
  name = name || "_";
  while (name in unsafeWindow) {
    name += Math.random().toString(36).substr(2);
  }
  switch (typeof value) {
    case "number":
    case "string":
    case "boolean":
    case "undefined":
      unsafeWindow[name] = value;
      console.log("exposed value with name %s", name);
      break;
    case "function":
      if ("function" === typeof exportFunction) {
        unsafeWindow[name] = exportFunction(value, unsafeWindow, {
          allowCrossOriginArguments: true
        });
        console.log("exposed function with name %s", name);
      } else {
        throw new Error("exportFunction is unavailable");
      }
      break;
    case "object":
      if ("function" === typeof cloneInto) {
        unsafeWindow[name] = cloneInto(value, unsafeWindow);
        console.log("exposed object with name %s", name);
      } else {
        throw new Error("cloneInto is unavailable");
      }
      break;
    default:
      throw new Error("expose: unsupported type!");
  }
}

// [@RUN] Run That Script! /////////////////////////////////////////////

injectUIStyle();
injectUIButton();
watchIncomingPupils();

console.log("%c[\u2713]%c Pupil Manager ended successfully.",
  "color: white; background-color: #280", "");
