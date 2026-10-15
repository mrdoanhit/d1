const PLAYLIST_FILE = 'playlist.json'; 

let playlistData = {}; 
let flatSongsList = []; 
let currentTrackIndex = -1; 
let isTrackChanging = false; 

let favoriteIds = JSON.parse(localStorage.getItem('drive_player_favorites')) || [];

const player = document.getElementById('audio-player');
const titleElement = document.getElementById('song-title');
const wrapperElement = document.getElementById('playlist-wrapper');
const statusElement = document.getElementById('status-msg');

// =========================================================================
// CẤU HÌNH NHẠC NỀN CHẠY ẨN ĐỘC LẬP - XOAY VÒNG, LƯU TRẠNG THÁI & ÂM LƯỢNG
// =========================================================================
const BG_SONGS = [
    "https://netlify.app",
    "https://netlify.app",
    "https://netlify.app",
    "https://netlify.app"
];
let currentBgIndex = 0;

// Mặc định ban đầu luôn là true (Bật sẵn) nếu trình duyệt chưa lưu trạng thái nào trước đó
let isBgMusicPlaying = localStorage.getItem('drive_player_bg_playing') !== 'true';

const bgAudio = document.getElementById('bg-audio');
const bgMusicBtn = document.getElementById('bg-music-btn');
const bgVolumeSlider = document.getElementById('bg-volume-slider');

// Hàm khởi tạo phát nhạc nền ẩn
function playBgTrack(index) {
    if (!bgAudio || BG_SONGS.length === 0) return;
    currentBgIndex = index;
    bgAudio.src = BG_SONGS[currentBgIndex];
    
    // Đọc và thiết lập mức âm lượng cũ đã lưu
    const savedVolume = localStorage.getItem('drive_player_bg_volume');
    if (savedVolume !== null) {
        bgAudio.volume = parseFloat(savedVolume);
        if (bgVolumeSlider) bgVolumeSlider.value = savedVolume;
    } else {
        // Mặc định ban đầu nếu chưa từng chỉnh là 0.1 (êm dịu)
        bgAudio.volume = 0.1;
        if (bgVolumeSlider) bgVolumeSlider.value = 0.1;
    }

    if (isBgMusicPlaying) {
        bgAudio.play().catch(err => console.log("Chờ người dùng tương tác màn hình để kích hoạt nhạc nền"));
    }
}

// Tự động chuyển bài nhạc nền ẩn tiếp theo khi hết bài
if (bgAudio) {
    bgAudio.onended = () => {
        let nextBgIndex = currentBgIndex + 1;
        if (nextBgIndex >= BG_SONGS.length) nextBgIndex = 0;
        playBgTrack(nextBgIndex);
    };
}

// Xử lý sự kiện khi thay đổi thanh kéo âm lượng nhạc nền
if (bgVolumeSlider && bgAudio) {
    bgVolumeSlider.oninput = (e) => {
        const volumeVal = e.target.value;
        bgAudio.volume = volumeVal;
        localStorage.setItem('drive_player_bg_volume', volumeVal); // Lưu cấu hình âm lượng vào trình duyệt
    };
}

// Khởi tạo trạng thái giao diện đồng bộ lúc tải trang web
function initBgMusicUI() {
    if (!bgMusicBtn) return;
    const statusText = bgMusicBtn.querySelector('.bg-music-status');
    
    if (isBgMusicPlaying) {
        bgMusicBtn.classList.add('playing');
        if (statusText) statusText.innerText = "🎵 Nhạc nền: Đang Bật";
        
        // Phát nhạc ngay khi người dùng có tương tác đầu tiên với trang web (để lách luật chặn autoplay của trình duyệt)
        const forcePlayOnInteraction = () => {
            if (isBgMusicPlaying && bgAudio.paused) {
                bgAudio.play().catch(err => console.log("Trình duyệt yêu cầu tương tác màn hình, nhạc nền đã kích hoạt thành công."));
            }
            document.removeEventListener('click', forcePlayOnInteraction);
        };
        document.addEventListener('click', forcePlayOnInteraction);
    } else {
        bgMusicBtn.classList.remove('playing');
        if (statusText) statusText.innerText = "🎵 Nhạc nền: Đang Tắt";
    }
}

// Xử lý sự kiện click vào Thanh ngang để Bật/Tắt nhạc nền
if (bgMusicBtn && bgAudio) {
    bgMusicBtn.onclick = () => {
        const statusText = bgMusicBtn.querySelector('.bg-music-status');
        
        if (isBgMusicPlaying) {
            bgAudio.pause();
            isBgMusicPlaying = false;
            localStorage.setItem('drive_player_bg_playing', 'false'); // Lưu trạng thái Tắt vào trình duyệt
            bgMusicBtn.classList.remove('playing');
            if (statusText) statusText.innerText = "🎵 Nhạc nền: Đang Tắt";
        } else {
            isBgMusicPlaying = true;
            localStorage.setItem('drive_player_bg_playing', 'true'); // Lưu trạng thái Bật vào trình duyệt
            if (!bgAudio.src) {
                playBgTrack(0);
            }
            bgAudio.play().catch(err => console.log("Không thể phát nhạc nền:", err));
            bgMusicBtn.classList.add('playing');
            if (statusText) statusText.innerText = "🎵 Nhạc nền: Đang Bật";
        }
    };
}

// =========================================================================
// LOGIC HỆ THỐNG PHÁT NHẠC CHÍNH TỪ GOOGLE DRIVE PHÍA DƯỚI
// =========================================================================

// Hàm làm sạch tên bài hát: Xử lý chuỗi trực tiếp đảm bảo sạch 100% đuôi .mp3 và dấu phẩy
function cleanSongName(name) {
    if (!name) return "";
    let cleaned = name.trim();
    
    // 1. Kiểm tra và cắt bỏ đuôi .mp3 ở cuối (không phân biệt chữ hoa/thường)
    if (cleaned.toLowerCase().endsWith('.mp3')) {
        cleaned = cleaned.slice(0, -4).trim();
    }
    
    // 2. Cắt bỏ dấu phẩy hoặc các khoảng trắng dư thừa còn sót lại ở cuối chuỗi
    while (cleaned.endsWith(',') || cleaned.endsWith(' ') || cleaned.endsWith('.') || cleaned.endsWith('_') || cleaned.endsWith('-')) {
        cleaned = cleaned.slice(0, -1).trim();
    }
    
    return cleaned;
}

function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỉ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Thêm bg4.jpg và bg5.jpg vào mảng ảnh nền ngẫu nhiên cục bộ
function setRandomBackground() {
    const backgrounds = ['bg1.jpg', 'bg2.jpg', 'bg3.jpg', 'bg4.jpg', 'bg5.jpg'];
    const randomIndex = Math.floor(Math.random() * backgrounds.length);
    const selectedBg = backgrounds[randomIndex];
    if (document.body) {
        document.body.style.backgroundImage = `url('${selectedBg}')`;
    }
}

async function fetchLocalPlaylist() {
    setRandomBackground();
    
    if (statusElement) statusElement.innerText = "Đang nạp danh sách nhạc từ hệ thống...";
    
    try {
        playlistData = {};
        flatSongsList = [];
        
        const response = await fetch(PLAYLIST_FILE);
        if (!response.ok) throw new Error(`Không thể đọc file ${PLAYLIST_FILE}`);
        
        const localData = await response.json();
        
        // Quét toàn bộ mọi danh mục có trong file json, hiển thị đầy đủ không thiếu bài
        for (const folderName in localData) {
            const songs = localData[folderName];
            if (songs && songs.length > 0) {
                playlistData[folderName] = songs;
                flatSongsList = flatSongsList.concat(songs);
            }
        }

        if (flatSongsList.length === 0) {
            if (statusElement) statusElement.innerText = "Không tìm thấy dữ liệu bài hát.";
            return;
        }

        renderGroupedPlaylist(playlistData);
        restoreLastPlayedTrack();

        // KÍCH HOẠT ĐỒNG BỘ NHẠC NỀN ẨN KHI TẢI XONG TRANG WEB
        playBgTrack(0);
        initBgMusicUI();

    } catch (error) {
        if (statusElement) statusElement.innerText = "Lỗi cấu trúc file playlist.json: " + error.message;
    }
}

function renderGroupedPlaylist(groupedData) {
    if (!wrapperElement) return;
    wrapperElement.innerHTML = '';
    
    const favoriteSongs = flatSongsList.filter(song => favoriteIds.includes(song.id));
    if (favoriteSongs.length > 0) {
        createFolderDOM("💖 Bài Hát Yêu Thích", favoriteSongs, true);
    }

    for (const folderName in groupedData) {
        const songs = groupedData[folderName];
        if (songs.length === 0) continue;
        createFolderDOM(folderName, songs, false);
    }

    if (currentTrackIndex !== -1) highlightCurrentSong();
}

function createFolderDOM(folderName, songs, isFavSection) {
    const titleDiv = document.createElement('div');
    titleDiv.className = isFavSection ? 'folder-section-title favorites-heading' : 'folder-section-title collapsed'; 
    titleDiv.innerText = folderName;
    wrapperElement.appendChild(titleDiv);

    const ul = document.createElement('ul');
    ul.className = 'playlist';

    titleDiv.onclick = () => { titleDiv.classList.toggle('collapsed'); };

    // Tạo mã băm số ngắn gọn dựa trên tên mục để làm ID an toàn cho DOM lớn
    let hash = 0;
    for (let i = 0; i < folderName.length; i++) {
        hash = (hash << 5) - hash + folderName.charCodeAt(i);
        hash |= 0;
    }
    const safeFolderId = 'f' + Math.abs(hash);

    // KỸ THUẬT CHIA TẢI (CHUNK RENDERING): Chia nhỏ dữ liệu lớn 5000 bài để trình duyệt không bị nuốt bài
    const CHUNK_SIZE = 200; 
    let currentIndex = 0;

    function renderChunk() {
        const end = Math.min(currentIndex + CHUNK_SIZE, songs.length);
        
        for (let i = currentIndex; i < end; i++) {
            const song = songs[i];
            const li = document.createElement('li');
            li.setAttribute('id', (isFavSection ? 'fav-' : 'song-' + safeFolderId + '-') + song.id);
            
            const textSpan = document.createElement('span');
            textSpan.innerText = cleanSongName(song.name);
            li.appendChild(textSpan);

            const heartSpan = document.createElement('span');
            heartSpan.className = 'fav-heart';
            heartSpan.innerText = '♥';
            if (favoriteIds.includes(song.id)) heartSpan.classList.add('active');

heartSpan.onclick = (e) => {
e.stopPropagation();
toggleFavorite(song.id, heartSpan);
};
li.appendChild(heartSpan);
li.onclick = () => {
const globalIndex = flatSongsList.findIndex(s => s.id === song.id);
playTrack(globalIndex, true);
};
ul.appendChild(li);
}
currentIndex += CHUNK_SIZE;
if (currentIndex < songs.length) {
setTimeout(renderChunk, 0);
}
}
renderChunk();
wrapperElement.appendChild(ul);
}
function toggleFavorite(songId, heartElement) {
const index = favoriteIds.indexOf(songId);
if (index > -1) {
favoriteIds.splice(index, 1);
heartElement.classList.remove('active');
} else {
favoriteIds.push(songId);
heartElement.classList.add('active');
}
localStorage.setItem('drive_player_favorites', JSON.stringify(favoriteIds));
renderGroupedPlaylist(playlistData);
}
function playTrack(index, autoPlay = true) {
if (index < 0 || index >= flatSongsList.length || !player) return;
isTrackChanging = true;
currentTrackIndex = index;
const currentSong = flatSongsList[currentTrackIndex];
let currentFolderName = "Danh mục nhạc";
for (const folder in playlistData) {
const found = playlistData[folder].some(s => s.id === currentSong.id);
if (found) {
currentFolderName = folder;
break;
}
}
if (statusElement) statusElement.innerText = currentFolderName;
if (titleElement) titleElement.innerText = cleanSongName(currentSong.name);
const p1 = "https://", p2 = "drive.", p3 = "google.com", p4 = "/file/d/";
const p5 = "/preview?autoplay=" + (autoPlay ? "1" : "0");
const embedUrl = p1 + p2 + p3 + p4 + currentSong.id + p5;
const currentScrollY = window.scrollY;
player.removeAttribute('src');
player.src = embedUrl;
highlightCurrentSong();
localStorage.setItem('drive_player_last_track_id', currentSong.id);
if (autoPlay) {
window.scrollTo({
top: 0,
behavior: 'smooth'
});
} else {
requestAnimationFrame(() => {
window.scrollTo(0, currentScrollY);
});
}
setTimeout(() => { isTrackChanging = false; }, 3000);
}
// SỬA LỖI CHÍNH: Khai báo hàm chuyển bài tự động cho Iframe
function handleIframeAutoNext() {
if (isTrackChanging || currentTrackIndex === -1) return;
executeNextTrackLogic();
}
// SỬA LỖI CHÍNH: Ép hàm liên kết trực tiếp vào đối tượng window để file HTML luôn tìm thấy
window.handleIframeAutoNext = handleIframeAutoNext;
function executeNextTrackLogic() {
if (flatSongsList.length === 0) return;
let nextIndex = currentTrackIndex + 1;
if (nextIndex >= flatSongsList.length) nextIndex = 0;
playTrack(nextIndex, true);
}
// Khôi phục trạng thái bài hát cũ khi tải lại trang web
function restoreLastPlayedTrack() {
const lastTrackId = localStorage.getItem('drive_player_last_track_id');
if (lastTrackId) {
const savedIndex = flatSongsList.findIndex(s => s.id === lastTrackId);
if (savedIndex !== -1) playTrack(savedIndex, false);
}
}
function nextTrack() { executeNextTrackLogic(); }
function prevTrack() {
if (flatSongsList.length === 0) return;
let prevIndex = currentTrackIndex - 1;
if (prevIndex < 0) prevIndex = flatSongsList.length - 1;
playTrack(prevIndex, true);
}
// Bộ lọc tìm kiếm bài hát theo tên
function filterSongs() {
const searchInput = document.getElementById('search-input');
if (!searchInput) return;
const rawKeyword = searchInput.value.toLowerCase().trim();
const keyword = removeVietnameseTones(rawKeyword);
let filteredData = {};
let tempFlatList = [];
for (const folderName in playlistData) {
const filteredSongs = playlistData[folderName].filter(song => {
const songNameNoTone = removeVietnameseTones(song.name.toLowerCase());
return songNameNoTone.includes(keyword);
});
if (filteredSongs.length > 0) {
filteredData[folderName] = filteredSongs;
tempFlatList = tempFlatList.concat(filteredSongs);
}
}
flatSongsList = tempFlatList;
renderGroupedPlaylist(filteredData);
}
// Tìm và kích hoạt highlight + hiệu ứng sóng nhạc cho tất cả các bài hát trùng mã ID (ở tất cả mọi mục)
function highlightCurrentSong() {
if (!wrapperElement) return;
const lists = wrapperElement.getElementsByTagName('li');
for (let item of lists) {
item.classList.remove('active');
const oldWave = item.querySelector('.wave-container');
if (oldWave) oldWave.remove();
}
const currentSong = flatSongsList[currentTrackIndex];
if (currentSong) {
const createWaveDOM = () => {
const waveDiv = document.createElement('div');
waveDiv.className = 'wave-container';
for (let i = 0; i < 4; i++) {
const bar = document.createElement('span');
bar.className = 'wave-bar';
waveDiv.appendChild(bar);
}
return waveDiv;
};
for (let liItem of lists) {
if (liItem.id.endsWith(currentSong.id)) {
liItem.classList.add('active');
const heart = liItem.querySelector('.fav-heart');
if (heart && !liItem.querySelector('.wave-container')) {
liItem.insertBefore(createWaveDOM(), heart);
}
}
}
}
}
// ĐTỰ ĐỘNG RÀNG BUỘC: Đăng ký sự kiện load cho Iframe trực tiếp từ code để tăng độ an toàn ổn định
if (player) {
player.addEventListener('load', handleIframeAutoNext);
}
window.onload = fetchLocalPlaylist;