/* =========================================================
 * Tiny QR Code generator (vanilla JS, zero deps).
 * Public-domain implementation derived from Project Nayuki's
 * QR-Code-generator (MIT). Trimmed to byte-mode + ECC L/M and
 * exposed as global `NebulaQR`.
 * ========================================================= */
(function (root) {
  "use strict";

  function QrSegment(mode, numChars, bitData) {
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData;
  }
  var Mode = {
    NUMERIC: { modeBits: 0x1, ccBits: [10, 12, 14] },
    ALPHANUMERIC: { modeBits: 0x2, ccBits: [9, 11, 13] },
    BYTE: { modeBits: 0x4, ccBits: [8, 16, 16] },
  };
  function getNumCharCountBits(mode, ver) {
    return mode.ccBits[Math.floor((ver + 7) / 17)];
  }

  function makeBytes(data) {
    var bb = [];
    for (var i = 0; i < data.length; i++) appendBits(data[i], 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  function getTotalBits(segs, ver) {
    var result = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var ccbits = getNumCharCountBits(s.mode, ver);
      if (s.numChars >= 1 << ccbits) return Infinity;
      result += 4 + ccbits + s.bitData.length;
    }
    return result;
  }

  // ECC code-words tables (Low + Medium only for compactness)
  var ECC_CODEWORDS_PER_BLOCK = {
    L: [
      -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30,
      30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    ],
    M: [
      -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28,
      28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    ],
  };
  var NUM_ERROR_CORRECTION_BLOCKS = {
    L: [
      -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 13, 14,
      15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25, 25,
    ],
    M: [
      -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23,
      25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
    ],
  };

  function QrCode(version, ecl, dataCodewords, mask) {
    this.version = version;
    this.size = version * 4 + 17;
    this.errorCorrectionLevel = ecl;
    var modules = [];
    var isFunction = [];
    for (var i = 0; i < this.size; i++) {
      modules.push(new Array(this.size).fill(false));
      isFunction.push(new Array(this.size).fill(false));
    }
    this.modules = modules;
    this.isFunction = isFunction;

    drawFunctionPatterns(this);
    var allCodewords = addEccAndInterleave(this, dataCodewords);
    drawCodewords(this, allCodewords);

    if (mask === -1) {
      var minPenalty = 1e9;
      for (var m = 0; m < 8; m++) {
        applyMask(this, m);
        drawFormatBits(this, m);
        var p = getPenaltyScore(this);
        if (p < minPenalty) {
          mask = m;
          minPenalty = p;
        }
        applyMask(this, m);
      }
    }
    this.mask = mask;
    applyMask(this, mask);
    drawFormatBits(this, mask);
    this.isFunction = null;
  }

  QrCode.encodeBinary = function (data, ecl) {
    var seg = makeBytes(data);
    var segs = [seg];
    var version;
    for (version = 1; version <= 40; version++) {
      var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
      var usedBits = getTotalBits(segs, version);
      if (usedBits <= dataCapacityBits) break;
      if (version === 40) throw new Error("Data too long");
    }
    var bb = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      appendBits(s.mode.modeBits, 4, bb);
      appendBits(s.numChars, getNumCharCountBits(s.mode, version), bb);
      for (var j = 0; j < s.bitData.length; j++) bb.push(s.bitData[j]);
    }
    var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    for (var pad = 0xec; bb.length < dataCapacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);
    var dataCodewords = [];
    for (var k = 0; k < bb.length / 8; k++) {
      var v = 0;
      for (var b = 0; b < 8; b++) v = (v << 1) | bb[k * 8 + b];
      dataCodewords.push(v);
    }
    return new QrCode(version, ecl, dataCodewords, -1);
  };

  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function getNumDataCodewords(ver, ecl) {
    return (
      Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
    );
  }

  function setFunctionModule(qr, x, y, isDark) {
    qr.modules[y][x] = isDark;
    qr.isFunction[y][x] = true;
  }
  function drawFunctionPatterns(qr) {
    var size = qr.size;
    for (var i = 0; i < size; i++) {
      setFunctionModule(qr, 6, i, i % 2 === 0);
      setFunctionModule(qr, i, 6, i % 2 === 0);
    }
    drawFinder(qr, 3, 3);
    drawFinder(qr, size - 4, 3);
    drawFinder(qr, 3, size - 4);
    var alignPos = getAlignmentPatternPositions(qr.version);
    for (var a = 0; a < alignPos.length; a++) {
      for (var b = 0; b < alignPos.length; b++) {
        if (
          (a === 0 && b === 0) ||
          (a === 0 && b === alignPos.length - 1) ||
          (a === alignPos.length - 1 && b === 0)
        )
          continue;
        drawAlignment(qr, alignPos[a], alignPos[b]);
      }
    }
    drawFormatBits(qr, 0);
    drawVersion(qr);
  }
  function drawFinder(qr, x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && xx < qr.size && yy >= 0 && yy < qr.size) {
          setFunctionModule(qr, xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }
  function drawAlignment(qr, x, y) {
    for (var dy = -2; dy <= 2; dy++)
      for (var dx = -2; dx <= 2; dx++)
        setFunctionModule(qr, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  function getAlignmentPatternPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }
  function drawFormatBits(qr, mask) {
    var ecl = qr.errorCorrectionLevel;
    var fb = ((ecl === "L" ? 1 : 0) << 3) | mask;
    var rem = fb;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((fb << 10) | rem) ^ 0x5412;
    for (var j = 0; j <= 5; j++) setFunctionModule(qr, 8, j, ((bits >>> j) & 1) !== 0);
    setFunctionModule(qr, 8, 7, ((bits >>> 6) & 1) !== 0);
    setFunctionModule(qr, 8, 8, ((bits >>> 7) & 1) !== 0);
    setFunctionModule(qr, 7, 8, ((bits >>> 8) & 1) !== 0);
    for (var k = 9; k < 15; k++) setFunctionModule(qr, 14 - k, 8, ((bits >>> k) & 1) !== 0);
    for (var l = 0; l < 8; l++) setFunctionModule(qr, qr.size - 1 - l, 8, ((bits >>> l) & 1) !== 0);
    for (var m = 8; m < 15; m++)
      setFunctionModule(qr, 8, qr.size - 15 + m, ((bits >>> m) & 1) !== 0);
    setFunctionModule(qr, 8, qr.size - 8, true);
  }
  function drawVersion(qr) {
    if (qr.version < 7) return;
    var rem = qr.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (qr.version << 12) | rem;
    for (var j = 0; j < 18; j++) {
      var bit = ((bits >>> j) & 1) !== 0;
      var a = qr.size - 11 + (j % 3),
        b = Math.floor(j / 3);
      setFunctionModule(qr, a, b, bit);
      setFunctionModule(qr, b, a, bit);
    }
  }

  function reedSolomonComputeDivisor(degree) {
    var result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }
  function reedSolomonComputeRemainder(data, divisor) {
    var result = new Array(divisor.length).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < result.length; j++) result[j] ^= reedSolomonMultiply(divisor[j], factor);
    }
    return result;
  }
  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function addEccAndInterleave(qr, data) {
    var ver = qr.version,
      ecl = qr.errorCorrectionLevel;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var col = 0; col < blocks[0].length; col++) {
      for (var row = 0; row < blocks.length; row++) {
        if (col !== shortBlockLen - blockEccLen || row >= numShortBlocks)
          result.push(blocks[row][col]);
      }
    }
    return result;
  }

  function drawCodewords(qr, data) {
    var size = qr.size,
      i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!qr.isFunction[y][x] && i < data.length * 8) {
            qr.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  function applyMask(qr, mask) {
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        var invert;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
        }
        if (!qr.isFunction[y][x] && invert) qr.modules[y][x] = !qr.modules[y][x];
      }
    }
  }
  function getPenaltyScore(qr) {
    var size = qr.size,
      penalty = 0,
      dark = 0;
    for (var y = 0; y < size; y++) {
      var run = 0,
        lastColor = false;
      for (var x = 0; x < size; x++) {
        if (qr.modules[y][x] === lastColor) {
          run++;
          if (run === 5) penalty += 3;
          else if (run > 5) penalty++;
        } else {
          lastColor = qr.modules[y][x];
          run = 1;
        }
        if (qr.modules[y][x]) dark++;
      }
    }
    for (var x2 = 0; x2 < size; x2++) {
      var run2 = 0,
        last2 = false;
      for (var y2 = 0; y2 < size; y2++) {
        if (qr.modules[y2][x2] === last2) {
          run2++;
          if (run2 === 5) penalty += 3;
          else if (run2 > 5) penalty++;
        } else {
          last2 = qr.modules[y2][x2];
          run2 = 1;
        }
      }
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    penalty += k * 10;
    return penalty;
  }

  // Public API
  root.NebulaQR = {
    /**
     * Render a QR code into an existing <svg> element.
     * @param {string} text   Data to encode (UTF-8)
     * @param {SVGElement} svg
     * @param {object} [opts] { ecl: "L"|"M", margin: 2, dark: "#000", light: "#fff" }
     */
    renderSVG: function (text, svg, opts) {
      opts = opts || {};
      var ecl = opts.ecl || "M";
      var bytes = utf8Encode(text);
      var qr = QrCode.encodeBinary(bytes, ecl);
      var margin = opts.margin == null ? 2 : opts.margin;
      var size = qr.size + margin * 2;
      var path = "";
      for (var y = 0; y < qr.size; y++) {
        for (var x = 0; x < qr.size; x++) {
          if (qr.modules[y][x]) path += "M" + (x + margin) + "," + (y + margin) + "h1v1h-1z";
        }
      }
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.setAttribute("viewBox", "0 0 " + size + " " + size);
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("shape-rendering", "crispEdges");
      var ns = "http://www.w3.org/2000/svg";
      var bg = document.createElementNS(ns, "rect");
      bg.setAttribute("width", size);
      bg.setAttribute("height", size);
      bg.setAttribute("fill", opts.light || "#ffffff");
      svg.appendChild(bg);
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", path);
      p.setAttribute("fill", opts.dark || "#0a0c1a");
      svg.appendChild(p);
    },
  };

  function utf8Encode(str) {
    var enc = new TextEncoder();
    return Array.from(enc.encode(str));
  }
})(window);
