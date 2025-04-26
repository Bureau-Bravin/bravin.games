document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('modal');
    const modalImg = document.getElementById('modal-img');
    const modalVideo = document.getElementById('modal-video');
    const modalClose = document.querySelector('.modal-close');

    // Add click handlers to all media overlays
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('media-overlay')) {
            const mediaType = event.target.getAttribute('data-media-type');
            const mediaUrl = event.target.getAttribute('data-media-url');

            modalImg.style.display = 'none';
            modalVideo.style.display = 'none';

            if (mediaType === 'image') {
                modalImg.style.display = 'block';
                modalImg.src = mediaUrl;
            } else {
                modalVideo.style.display = 'block';
                modalVideo.src = mediaUrl;
            }
            
            modal.style.display = 'block';
        }
    });

    // Close handlers
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });

    function closeModal() {
        modal.style.display = 'none';
        modalVideo.src = '';
        modalImg.src = '';
    }
});
