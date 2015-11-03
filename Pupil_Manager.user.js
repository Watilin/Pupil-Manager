// ==UserScript==
// @name          Pupil Manager
// @namespace     fr.kergoz-panic.watilin
// @description   Outil pour gérer l’envoi et la réception d’élèves dans Teacher-Story.
// @include       http://teacher-story.com/*
// @version       1.0
// @icon          icon.png
// @noframes
// @grant         GM_xmlhttpRequest
// @grant         GM_getResourceText
// @grant         GM_getResourceURL
// @resource      ui-html           ui.html
// @resource      ui-style          ui.css
// @resource      artwork           artwork.png
// ==/UserScript==

"use strict";

/* Table of Contents: use Ctrl+F and start with @, e.g. @DAT
 * [ARR] Array Generics Shim
 * [DAT] Data Retrieval
 * [UI]  UI Injection & Manipulation
 * [DEV] Development & Debug
 * [INI] Initialization
 */

// [@ARR] Array Generics Shim //////////////////////////////////////////

[ "slice", "forEach", "map", "filter", "some", "every", "reduce" ]
  .forEach(function (methodName) {
    if (!(methodName in Array)) {
      Array[methodName] = function (iterable, callback, context) {
        Array.prototype[methodName].call(iterable, callback, context);
      };
    }
  });

// [@DAT] Data Retrieval ///////////////////////////////////////////////

function logRequestError(resp) {
  console.warn("GM_xmlhttpRequest error: %d %s",
               resp.status,
               resp.statusText);
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
      }
      $container = document.getElementById("gameInfos");
      className = "button smallButton";
      break;

    case "/teacher":
    case "/ranks":
    case "/help":
    case "/game/victory":
    case "/game/chooseMission":
      caseTeacher();
      break;

    case "/game/results":
      // doesn’t inject Pupil Manager when the page has no
      // regular “send student” button
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
  });

  return $button;
}

function fillContactTable($container) {
  requestContacts(function (html) {
    var $table = $container.querySelector(".contacts table");
    var $modelRow = $container.querySelector(".contacts tr.model");
    $modelRow.remove();
    $modelRow.classList.remove("model");

    var contacts = parseContacts(html);
    var $tbody;
    contacts.forEach(function (contact, i) {
      if (!(i % 10)) $tbody = $table.createTBody();
      $tbody.style.display = "none";

      var $row = $modelRow.cloneNode(true);
      $tbody.appendChild($row);

      var $picCell          = $row.querySelector(".pic");
      var $nameCell         = $row.querySelector(".name");
      var $friendCell       = $row.querySelector(".friend");
      /*
      var $receivedCell     = $row.querySelector(".received");
      var $sentCell         = $row.querySelector(".sent");
      var $lastReceivedCell = $row.querySelector(".last-received");
      var $lastSentCell     = $row.querySelector(".last-sent");
      */
      var $actionCell       = $row.querySelector(".action");
      var $statusCell       = $row.querySelector(".status");

      if (contact.avatar) {
        var $img = new Image();
        $img.alt = contact.name;
        $img.width = 16;
        $img.height = 16;
        $img.src = contact.avatar;
        $picCell.appendChild($img);
      }
      $nameCell.textContent = contact.name;
      $friendCell.textContent = contact.friend ? "\u2665" : "";

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
              if (response.finalUrl.endsWith("/teacher")) {
                $button.textContent = "Échec";
                $button.classList.add("failure");
                var text = response.responseText;
                if (text.contains("a déjà un élève à votre nom")) {
                  $statusCell.textContent = "a déjà un élève";
                } else if (text.contains("a atteint le maximum")) {
                  $statusCell.textContent = "a atteint le maximum";
                } else {
                  $statusCell.textContent = "raison inconnue";
                  expose(text, "raisonInconnue");
                }
              } else {
                $button.textContent = "Ok\xA0!";
                $button.classList.add("success");
                var nPupils = parseInt($pupilsLeft.textContent, 10) - 1;
                $pupilsLeft.textContent = nPupils +
                  (nPupils > 1 ? " élèves" : " élève");
                if (!nPupils) {
                  $container.classList.add("no-more-pupils");
                }
              }
            }
          });
        });
    });

    var $pagination = $container.querySelector(".pagination");
    var $$tbodies = $table.getElementsByTagName("tbody");
    var buttons = [];

    var nPages = Math.ceil(contacts.length / 10);
    for (var i = 1; i <= nPages; i++) (function (i) {
      var $pageButton = document.createElement("a");
      $pageButton.href = "#";
      $pageButton.textContent = i;

      $pageButton.addEventListener("click", function (event) {
        event.preventDefault();
        for (var j = 0; j < buttons.length; j++) {
          $$tbodies[j].style.display = "none";
          buttons[j].classList.remove("active");
        }
        $$tbodies[i - 1].style.display = "";
        buttons[i - 1].classList.add("active");
      });

      buttons.push($pageButton);
      $pagination.appendChild($pageButton);
      if (i < nPages) {
        $pagination.appendChild(document.createTextNode(" - "));
      }
    }(i));

    $table.style.display = "";
    buttons[0].classList.add("active");
    $table.querySelector("tbody").style.display = "";
    $container.querySelector(".loading").style.display = "none";
  });
}

// [@DEV] Development & Debug //////////////////////////////////////////

function expose(value, name) {
  while (name in unsafeWindow) {
    name += Math.random().toString(36).substr(2);
  }
  switch (typeof value) {
    case "number":
    case "string":
    case "boolean":
      unsafeWindow[name] = value;
      console.log("exposed value with name %s", name);
      break;
    case "function":
      if ("exportFunction" in this) {
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
      if ("cloneInto" in this) {
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

// [@INI] Initialization ///////////////////////////////////////////////

injectUIStyle();
injectUIButton();

console.log("Pupil Manager ended successfully.");
