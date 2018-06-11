// ==UserScript==
// @name          Pupil Manager
// @namespace     fr.kergoz-panic.watilin
// @description   Outil pour gérer l’envoi et la réception d’élèves dans Teacher-Story.
// @version       1.2.1
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
// @resource      ui-html           ui.html?=v1.2.1
// @resource      ui-style          ui.css?v=1.2.1
// @resource      artwork           artwork.png?v=1.2.1
// ==/UserScript==

"use strict";

/* Table of Contents: use Ctrl+F and start with @, e.g. @DAT
 * [SHI] Shims for Retarded Browsers
 * [DAT] Data Retrieval
 * [UI]  UI Injection & Manipulation
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

// [@DAT] Data Retrieval ///////////////////////////////////////////////

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

function parseContacts(html) {
  var $div = document.createElement("div");
  $div.insertAdjacentHTML("afterbegin", html);
  var $contacts = $div.querySelector(".searchContacts");

  var contacts = [];
  var isFriend = true;
  var tidDataRegexp = /^([^\/]+)\/(\d+)$/;

  var $elt;
  while ($elt = $contacts.firstElementChild) {
    switch ($elt.className) {
      case "select friend":
        var match = $elt.getAttribute("tid_data").match(tidDataRegexp);
        var name = match[1];
        var id = match[2];
        var $avatar = $elt.querySelector(".avatarImg");
        contacts.push({
          id     : id,
          name   : name,
          friend : isFriend,
          avatar : $avatar && $avatar.src
        });
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

  return contacts;
}

// [@UI] UI Injection & Manipulation ///////////////////////////////////

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

  $ui.querySelector(".button").addEventListener("click", function (event) {
    event.preventDefault();
    $ui.style.display = "none";
  });

  var $content = document.querySelector(".content");
  $content.parentNode.insertBefore($ui, $content.nextSibling);

  return $ui;
}

function injectUIButton() {
  var $button = document.createElement("a");
  $button.id = "pupil-manager-button";
  $button.textContent = "Pupil Manager";

  var $refButton;
  var nPupils = 0;
  var $container;
  var className;

  var caseTeacher = function caseTeacher() {
    $refButton = document.querySelector(".banner .button");
    if ($refButton) {
      nPupils = parseInt(
        document.querySelector(".banner strong").textContent, 10);
      $container = $refButton.parentNode;
    } else {
      document.querySelector(".firstmenu").insertAdjacentHTML(
        "afterend",
        "<div class='clear'></div><div class='banner'></div>"
      );
      $container = document.querySelector(".banner");
      $container.textContent = "Plus d’élèves à envoyer aujourd’hui… ";
    }
    className = "button mediumButton";
  };

  switch (location.pathname) {
    case "/":
    case "/game":
      $refButton = document.querySelector("#gameInfos .button");
      if ($refButton) {
        nPupils = $refButton.onmouseover.toString()
          .match(/<strong>(\d)/)[1];
        $container = $refButton.parentNode;
      } else {
        $container = document.getElementById("gameInfos");
      }
      className = "button smallButton";
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
      // doesn’t inject Pupil Manager when the page has no
      // regular “send student” button
      // TODO check if /game/victory should go here too
      return;

    default:
      if (location.pathname.startsWith("/teacher/")) {
        caseTeacher();
      } else {
        throw "not implemented for " + location.pathname;
      }
  }

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

  return $button;
}

function fillContactTable($container) {
  requestContacts(function (html) {
    var $table = $container.querySelector(".contacts table");

    var $pagination = $container.querySelector(".pagination");
    var buttons = [];
    var activePage;

    var contacts = parseContacts(html);
    var tid = unsafeWindow._tid.session.tid;

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
    /* Contact structure in storage:
      key: {string} <userId>-<contactId> (example: "378517-1355707")
      {
        sent:     {unsigned int}
        lastSent: {timestamp}
        status:   {enum("ok", "alreadySent", "maxedOut", "error")}
      }
    */
    contacts.forEach(function (contact, i) {
      if (!(i % 10)) $tbody = $table.createTBody();
      $tbody.style.display = "none";

      var $row = $modelRow.cloneNode(true);
      $tbody.appendChild($row);

      var $picCell          = $row.querySelector(".pic");
      var $nameCell         = $row.querySelector(".name");
      var $friendCell       = $row.querySelector(".friend");
      /*
      TODO
      var $receivedCell     = $row.querySelector(".received");
      var $lastReceivedCell = $row.querySelector(".last-received");
      */
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
      $friendCell.textContent = contact.friend ? "\u2665" : "";

      var contactKey = tid + "-" + contact.id;
      var contactInfo = JSON.parse(GM_getValue(contactKey, "null"));
      if (contactInfo) {
        $sentCell.textContent = contactInfo.sent;
        updateDateCell($lastSentCell, contactInfo.lastSent);
        updateStatusCell($statusCell, contactInfo.status);
      } else {
        $sentCell.textContent =     "–";
        $lastSentCell.textContent = "–";
        $statusCell.textContent =   "–";
      }

      var $pupilsLeft =
        $container.querySelector(".pupils-to-send strong");
      $actionCell.querySelector(".send-now").addEventListener("click",
        function (event) {
          event.preventDefault();

          var $button = this;
          if ($button.classList.contains("used")) return;
          if ($container.classList.contains("no-more-pupils")) return;
          $button.classList.add("used");
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
            onerror: logRequestError,

            onload: function (response) {
              var contactKey = tid + "-" + contact.id;
              var contactInfo = JSON.parse(GM_getValue(contactKey, "null"));
              if (!contactInfo) contactInfo = {};
              if (!contactInfo.sent) contactInfo.sent = 0;

              var now = Date.now();
              contactInfo.lastSent = now;
              updateDateCell($lastSentCell, now);

              if (response.finalUrl.endsWith("/teacher")) { // failure

                $button.textContent = "Échec";
                $button.classList.add("failure");

                var text = response.responseText;
                var status;
                if (text.contains("a déjà un élève à votre nom")) {
                  status = "alreadySent";
                } else if (text.contains("a atteint le maximum")) {
                  status = "maxedOut";
                } else {
                  status = "error";
                  expose(text, "raisonInconnue");
                }
                updateStatusCell($statusCell, status);
                contactInfo.status = status;

                highlightUpdate($lastSentCell, $statusCell, $actionCell);

              } else { // success

                contactInfo.sent++;
                contactInfo.status = "ok";
                updateStatusCell($statusCell, "ok");
                $button.textContent = "Ok\xA0!";
                $button.classList.add("success");
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
              console.log("contact info saved");
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
  var date = new Date(timestamp);
  var diff = (Date.now() - date) / 1000;
  $cell.textContent =
    (diff < 60)        ? "< 1\xA0min" :
    (diff < 3600)      ? "< 1\xA0h" :
    (diff < 86400)     ? Math.floor(diff / 3600) + "\xA0h" :
    (diff < 3 * 86400) ? Math.floor(diff / 86400) + "\xA0j" :
    date.toLocaleDateString();
  $cell.title = date.toLocaleDateString() + " " + date.toLocaleTimeString();
  $cell.dataset.timestamp = timestamp;
}

const StatusStrings = {
  "ok"          : "ok",
  "alreadySent" : "a déjà un élève",
  "maxedOut"    : "a atteint le maximum",
  "error"       : "raison inconnue"
};

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

// [@DEV] Development & Debug //////////////////////////////////////////

function logRequestError(resp) {
  console.warn("GM_xmlhttpRequest error: %d %s",
               resp.status,
               resp.statusText);
}

function expose(value, name) {
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
        exportFunction(value, unsafeWindow, {
          defineAs: name,
          allowCrossOriginArguments: true
        });
        console.log("exposed function with name %s", name);
      } else {
        throw new Error("can't expose sandboxed function");
      }
      break;
    case "object":
      if ("function" === typeof cloneInto) {
        unsafeWindow[name] = cloneInto(value, unsafeWindow);
        console.log("exposed object with name %s", name);
      } else {
        throw new Error("can't expose sandboxed object");
      }
      break;
    default:
      throw new Error("expose: unsupported type!");
  }
}

// [@RUN] Run That Script! /////////////////////////////////////////////

injectUIStyle();
injectUIButton();

console.log("Pupil Manager ended successfully.");
