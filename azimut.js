let map, azimutDataByNumero = new Map(), polylines = [], markers = [];
let lastData = [], allTimestamps = [], animationInterval = null;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: {lat: 46.5, lng: 2.5},
    zoom: 6
  });
}

window.onload = function() {
  initMap();

  document.getElementById('csvFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
          updateData(results.data);
        }
      });
    }
  });

  document.getElementById('numeroSelect').addEventListener('change', drawVisibleAzimuts);
  document.getElementById('timeSlider').addEventListener('input', drawVisibleAzimuts);
  document.getElementById('playPauseBtn').addEventListener('click', toggleAnimation);
};

function updateData(data) {
  lastData = data;
  azimutDataByNumero.clear();
  allTimestamps = [];

  const numeroSet = new Set();

  data.forEach(row => {
    const Numero = row.Numero || row.numero;
    const lat = parseFloat(row.Latitude || row.latitude);
    const lng = parseFloat(row.Longitude || row.longitude);
    const azimut = parseFloat((row.Azimut || row.azimut || '').replace(',', '.'));
    const timestamp = new Date(row.Timestamp || row.timestamp || row.Date || row.date);

    if (Numero && !isNaN(lat) && !isNaN(lng) && !isNaN(azimut) && !isNaN(timestamp)) {
      if (!azimutDataByNumero.has(Numero)) azimutDataByNumero.set(Numero, []);
      azimutDataByNumero.get(Numero).push({lat, lng, azimut, timestamp});
      numeroSet.add(Numero);
      allTimestamps.push(timestamp);
    }
  });

  const select = document.getElementById('numeroSelect');
  select.innerHTML = '<option value="">Tous les individus</option>';
  Array.from(numeroSet).sort().forEach(num => {
    select.innerHTML += `<option value="${num}">${num}</option>`;
  });

  allTimestamps = [...new Set(allTimestamps)].sort((a, b) => a - b);
  const slider = document.getElementById('timeSlider');
  slider.min = 0;
  slider.max = allTimestamps.length - 1;
  slider.value = allTimestamps.length - 1;

  drawVisibleAzimuts();
}

function drawVisibleAzimuts() {
  polylines.forEach(p => p.setMap(null));
  markers.forEach(m => m.setMap(null));
  polylines = [];
  markers = [];

  const index = parseInt(document.getElementById('timeSlider').value);
  const cutoff = allTimestamps[index];
  document.getElementById('timeLabel').textContent = cutoff.toLocaleString();

  const selectedNumero = document.getElementById('numeroSelect').value;
  const numeros = selectedNumero ? [selectedNumero] : [...azimutDataByNumero.keys()];

  numeros.forEach(numero => {
    const points = azimutDataByNumero.get(numero).filter(p => p.timestamp <= cutoff);
    if (points.length < 2) return;

    points.forEach(pt => {
      const dest = computeDestinationPoint(pt.lat, pt.lng, pt.azimut, 2);
      polylines.push(new google.maps.Polyline({
        path: [{lat: pt.lat, lng: pt.lng}, {lat: dest.lat, lng: dest.lng}],
        geodesic: true,
        strokeColor: "#FF0000",
        strokeOpacity: 1.0,
        strokeWeight: 2,
        map: map
      }));

      markers.push(new google.maps.Marker({
        position: {lat: pt.lat, lng: pt.lng},
        map: map,
        label: numero,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: "#0000FF",
          fillOpacity: 0.8,
          strokeWeight: 1,
          strokeColor: "#000088"
        }
      }));
    });

    for (let i = 0; i < points.length - 1; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const intersect = intersectionOfAzimuts(points[i], points[i].azimut, points[j], points[j].azimut);
        if (intersect) {
          markers.push(new google.maps.Marker({
            position: intersect,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#00FF00",
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#006600"
            },
            title: `Croisement azimuts ${numero}`
          }));
        }
      }
    }
  });
}

function toggleAnimation() {
  const btn = document.getElementById('playPauseBtn');
  if (animationInterval) {
    clearInterval(animationInterval);
    animationInterval = null;
    btn.textContent = '▶️ Lecture';
  } else {
    animationInterval = setInterval(() => {
      const slider = document.getElementById('timeSlider');
      if (parseInt(slider.value) >= allTimestamps.length - 1) {
        clearInterval(animationInterval);
        animationInterval = null;
        btn.textContent = '▶️ Lecture';
        return;
      }
      slider.value = parseInt(slider.value) + 1;
      drawVisibleAzimuts();
    }, 500);
    btn.textContent = '⏸️ Pause';
  }
}

function computeDestinationPoint(lat, lng, azimut, distanceKm) {
  const R = 6371, brng = azimut * Math.PI / 180, d = distanceKm / R;
  const lat1 = lat * Math.PI / 180, lng1 = lng * Math.PI / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return {lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI};
}

function intersectionOfAzimuts(pt1, az1, pt2, az2) {
  const az1Rad = az1 * Math.PI / 180, az2Rad = az2 * Math.PI / 180;
  const dx1 = Math.sin(az1Rad), dy1 = Math.cos(az1Rad);
  const dx2 = Math.sin(az2Rad), dy2 = Math.cos(az2Rad);

  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-10) return null;

  const deltaLat = pt2.lat - pt1.lat, deltaLng = pt2.lng - pt1.lng;
  const t1 = (deltaLat * dx2 + deltaLng * dy2) / -denominator;

  return {lat: pt1.lat + t1 * dx1, lng: pt1.lng + t1 * dy1};
}
