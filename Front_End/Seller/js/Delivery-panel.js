    // ===== DATA =====
    const shippingPartners = [
      { id: 'tcs', name: 'TCS', logo: '', speed: '2-3 days', charge: '₹50', rating: '4.8/5' },
      { id: 'mp', name: 'M&P Express', logo: '', speed: '1-2 days', charge: '₹75', rating: '4.9/5' },
      { id: 'leopard', name: 'Leopard Courier', logo: '', speed: '2-4 days', charge: '₹40', rating: '4.6/5' },
      { id: 'own', name: 'Own Courier', logo: '', speed: '1-3 days', charge: '₹0', rating: 'Custom' }
    ];

    const sampleOrders = [
      { id: 'ORD-001', customer: 'John Doe', items: 3, amount: '₹2,500', date: '2025-12-05' },
      { id: 'ORD-002', customer: 'Jane Smith', items: 1, amount: '₹1,200', date: '2025-12-04' },
      { id: 'ORD-003', customer: 'Mike Johnson', items: 5, amount: '₹4,800', date: '2025-12-03' },
      { id: 'ORD-004', customer: 'Sarah Williams', items: 2, amount: '₹3,100', date: '2025-12-02' },
      { id: 'ORD-005', customer: 'Tom Brown', items: 4, amount: '₹5,600', date: '2025-12-01' }
    ];

    let selectedPartner = null;
    let createdShipments = [];
    let currentShipmentForTracking = null;
    let confirmCallback = null;
    let currentPage = 1;
    const itemsPerPage = 10;
    let filteredShipments = [];

    // ===== INITIALIZATION =====
    function initializeDeliveryPanel() {
      renderPartners();
      populateOrderSelects();
      populatePartnerSelects();
      setupSearchListeners();
    }

    // Call immediately (for fetch/eval loading)
    initializeDeliveryPanel();

    // Also call on DOMContentLoaded (for direct page load)
    document.addEventListener('DOMContentLoaded', function() {
      initializeDeliveryPanel();
    });

    // ===== SHIPPING PARTNERS =====
    function renderPartners() {
      const grid = document.getElementById('partnersGrid');
      grid.innerHTML = shippingPartners.map(partner => `
        <div class="partner-card ${selectedPartner?.id === partner.id ? 'selected' : ''}" onclick="selectPartner('${partner.id}')">
          <div class="partner-logo">${partner.logo}</div>
          <div class="partner-name">${partner.name}</div>
          <div class="partner-details">
            <p style="margin: 5px 0; font-size: 12px;">⚡ ${partner.speed}</p>
            <p style="margin: 5px 0; font-size: 12px;">💰 ${partner.charge}</p>
            <p style="margin: 5px 0; font-size: 12px;">⭐ ${partner.rating}</p>
          </div>
        </div>
      `).join('');
    }

    function selectPartner(partnerId) {
      selectedPartner = shippingPartners.find(p => p.id === partnerId);
      renderPartners();
      displaySelectedPartnerDetails();
    }

    function displaySelectedPartnerDetails() {
      const detailsDiv = document.getElementById('selectedPartnerDetails');
      if (!selectedPartner) {
        detailsDiv.innerHTML = '<p style="color: #999;">Select a partner to view details</p>';
        return;
      }

      detailsDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px;">
          <div>
            <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Partner Name</p>
            <p style="font-weight: 600; color: #333;">${selectedPartner.name}</p>
          </div>
          <div>
            <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Delivery Speed</p>
            <p style="font-weight: 600; color: #333;">${selectedPartner.speed}</p>
          </div>
          <div>
            <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Charge</p>
            <p style="font-weight: 600; color: #232f3e; font-size: 16px;">${selectedPartner.charge}</p>
          </div>
          <div>
            <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Rating</p>
            <p style="font-weight: 600; color: #232f3e;">⭐ ${selectedPartner.rating}</p>
          </div>
        </div>
        <div style="margin-top: 15px;">
          <button class="btn btn-primary" onclick="showConfirmation('Partner Selected', 'You have selected ${selectedPartner.name} as your default shipping partner.')">Set as Default</button>
        </div>
      `;
    }

    // ===== POPULATE DROPDOWNS =====
    function populateOrderSelects() {
      const select = document.getElementById('orderSelect');
      select.innerHTML = '<option value="">-- Select an Order --</option>' + 
        sampleOrders.map(o => `<option value="${o.id}">${o.id} - ${o.customer}</option>`).join('');
    }

    function populatePartnerSelects() {
      const select = document.getElementById('partnerSelect');
      select.innerHTML = '<option value="">-- Select a Partner --</option>' + 
        shippingPartners.map(p => `<option value="${p.id}">${p.name} - ${p.charge}</option>`).join('');
    }

    // ===== TAB SWITCHING =====
    function switchTab(tabName, btn) {
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(tabName + '-tab').classList.add('active');
      btn.classList.add('active');

      if (tabName === 'active') {
        filteredShipments = [...createdShipments];
        renderShipmentsTable();
      }
    }

    // ===== CREATE SHIPMENT =====
    function openCreateShipmentModal() {
      document.getElementById('createShipmentModal').classList.add('active');
      document.getElementById('pickupDate').valueAsDate = new Date();
    }

    function closeCreateShipmentModal() {
      document.getElementById('createShipmentModal').classList.remove('active');
      document.getElementById('orderSelect').value = '';
      document.getElementById('partnerSelect').value = '';
      document.getElementById('packageWeight').value = '';
      document.getElementById('packageDimensions').value = '';
      document.getElementById('pickupDate').value = '';
      document.getElementById('deliveryDate').value = '';
      document.getElementById('shipmentNotes').value = '';
    }

    function createShipment() {
      const orderId = document.getElementById('orderSelect').value;
      const partnerId = document.getElementById('partnerSelect').value;
      const weight = document.getElementById('packageWeight').value;
      const dimensions = document.getElementById('packageDimensions').value;
      const pickupDate = document.getElementById('pickupDate').value;
      const deliveryDate = document.getElementById('deliveryDate').value;
      const notes = document.getElementById('shipmentNotes').value;

      if (!orderId || !partnerId || !weight || !dimensions || !pickupDate || !deliveryDate) {
        alert('Please fill in all required fields (marked with *)');
        return;
      }

      const shipmentId = 'SHP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      const partner = shippingPartners.find(p => p.id === partnerId);
      const order = sampleOrders.find(o => o.id === orderId);

      const shipment = {
        id: shipmentId,
        orderId: orderId,
        customer: order.customer,
        partner: partner.name,
        weight: weight,
        dimensions: dimensions,
        pickupDate: pickupDate,
        deliveryDate: deliveryDate,
        notes: notes,
        status: 'Pending',
        trackingId: null,
        internalNotes: '',
        createdAt: new Date().toLocaleDateString(),
        timeline: [
          { step: 'Pending', date: new Date().toLocaleDateString(), completed: true, current: true }
        ]
      };

      createdShipments.push(shipment);
      showConfirmation('✅ Shipment Created Successfully', `Shipment ${shipmentId} has been created for order ${orderId}. Next step: Upload tracking ID once pickup is done.`, function() {
        closeCreateShipmentModal();
        renderCreatedShipments();
        switchTab('shipments', document.querySelectorAll('.tab-btn')[1]);
      });
    }

    function renderCreatedShipments() {
      const container = document.getElementById('createdShipmentsContainer');

      if (createdShipments.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <p>No shipments created yet</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Shipment ID</th>
              <th>Order ID</th>
              <th>Partner</th>
              <th>Pickup Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${createdShipments.map(shipment => `
              <tr>
                <td><strong>${shipment.id}</strong></td>
                <td>${shipment.orderId}</td>
                <td>${shipment.partner}</td>
                <td>${shipment.pickupDate}</td>
                <td><span class="status-badge status-${shipment.status.toLowerCase().replace(/\s+/g, '-')}">${shipment.status}</span></td>
                <td>
                  ${!shipment.trackingId ? `<button class="btn-view" onclick="openTrackingIdModal('${shipment.id}')">Upload ID</button>` : `<button class="btn-view" onclick="viewTrackingDetails('${shipment.id}')">View Details</button>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // ===== TRACKING ID UPLOAD =====
    function openTrackingIdModal(shipmentId) {
      const shipment = createdShipments.find(s => s.id === shipmentId);
      if (!shipment) return;

      currentShipmentForTracking = shipment;
      document.getElementById('shipmentIdInput').value = shipmentId;
      document.getElementById('trackingIdInput').value = shipment.trackingId || '';
      document.getElementById('trackingIdModal').classList.add('active');
    }

    function closeTrackingIdModal() {
      document.getElementById('trackingIdModal').classList.remove('active');
      document.getElementById('trackingIdInput').value = '';
      document.getElementById('trackingNotes').value = '';
    }

    function uploadTrackingId() {
      const trackingId = document.getElementById('trackingIdInput').value.trim();

      if (!trackingId) {
        alert('Please enter a tracking ID');
        return;
      }

      if (!/^[A-Z0-9]{8,}$/.test(trackingId)) {
        alert('Please enter a valid tracking ID (minimum 8 alphanumeric characters)');
        return;
      }

      if (currentShipmentForTracking) {
        currentShipmentForTracking.trackingId = trackingId;
        currentShipmentForTracking.status = 'In Transit';
        currentShipmentForTracking.internalNotes = document.getElementById('trackingNotes').value;
        currentShipmentForTracking.timeline.push({
          step: 'In Transit',
          date: new Date().toLocaleDateString(),
          completed: false,
          current: true
        });

        showConfirmation('✅ Tracking ID Uploaded', `Tracking ID ${trackingId} has been uploaded successfully. Shipment status updated to "In Transit".`, function() {
          closeTrackingIdModal();
          renderCreatedShipments();
        });
      }
    }

    // ===== SEARCH & TRACKING =====
    function setupSearchListeners() {
      const searchInput = document.getElementById('shipmentSearch');
      const filterSelect = document.getElementById('shipmentFilter');

      if (searchInput) searchInput.addEventListener('input', function() {
        currentPage = 1;
        updateFilteredShipments();
      });
      if (filterSelect) filterSelect.addEventListener('change', function() {
        currentPage = 1;
        updateFilteredShipments();
      });
    }

    function updateFilteredShipments() {
      const searchValue = document.getElementById('shipmentSearch').value.toLowerCase();
      const filterValue = document.getElementById('shipmentFilter').value;

      filteredShipments = createdShipments.filter(shipment => {
        const matchesSearch = shipment.orderId.toLowerCase().includes(searchValue) || 
                            shipment.id.toLowerCase().includes(searchValue) ||
                            shipment.customer.toLowerCase().includes(searchValue);
        const matchesFilter = filterValue === '' || shipment.status === filterValue;
        return matchesSearch && matchesFilter;
      });

      renderShipmentsTable();
    }

    function renderShipmentsTable() {
      const tableBody = document.getElementById('shipmentsTableBody');
      if (!filteredShipments || filteredShipments.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #999;">No shipments found</td></tr>`;
        document.getElementById('shipmentsPagination').innerHTML = '';
        return;
      }

      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const pageItems = filteredShipments.slice(start, end);

      tableBody.innerHTML = pageItems.map(shipment => `
        <tr>
          <td><strong>${shipment.orderId}</strong></td>
          <td>${shipment.trackingId || '—'}</td>
          <td>${shipment.partner}</td>
          <td><span class="status-badge status-${shipment.status.toLowerCase().replace(/\s+/g, '-')}">${shipment.status}</span></td>
          <td>${shipment.pickupDate}</td>
          <td>${shipment.deliveryDate}</td>
          <td><button class="btn-view" onclick="viewTrackingDetails('${shipment.id}')">View</button></td>
        </tr>
      `).join('');

      renderPagination();
    }

    function renderPagination() {
      const paginationDiv = document.getElementById('shipmentsPagination');
      paginationDiv.innerHTML = '';
      const totalPages = Math.ceil(filteredShipments.length / itemsPerPage);

      if (totalPages <= 1) return;

      const prevBtn = document.createElement('button');
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderShipmentsTable();
        }
      });
      paginationDiv.appendChild(prevBtn);

      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.addEventListener('click', () => {
          currentPage = i;
          renderShipmentsTable();
        });
        paginationDiv.appendChild(pageBtn);
      }

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderShipmentsTable();
        }
      });
      paginationDiv.appendChild(nextBtn);
    }

    // ===== SEARCH TRACKING =====
    function searchTracking() {
      const searchTerm = document.getElementById('trackingSearch').value.toLowerCase();

      if (!searchTerm) {
        document.getElementById('trackingResultsContainer').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <p>Enter an Order ID or Tracking ID to view shipment details</p>
          </div>
        `;
        return;
      }

      const results = createdShipments.filter(s =>
        s.orderId.toLowerCase().includes(searchTerm) ||
        (s.trackingId && s.trackingId.toLowerCase().includes(searchTerm)) ||
        s.id.toLowerCase().includes(searchTerm)
      );

      if (results.length === 0) {
        document.getElementById('trackingResultsContainer').innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">❌</div>
            <p>No shipments found matching your search</p>
          </div>
        `;
        return;
      }

      document.getElementById('trackingResultsContainer').innerHTML = results.map(shipment => `
        <div style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
            <div>
              <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Order ID</p>
              <p style="font-weight: 600; color: #333;">${shipment.orderId}</p>
            </div>
            <div>
              <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Tracking ID</p>
              <p style="font-weight: 600; color: #333;">${shipment.trackingId || 'Pending'}</p>
            </div>
            <div>
              <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Partner</p>
              <p style="font-weight: 600; color: #333;">${shipment.partner}</p>
            </div>
            <div>
              <p style="color: #999; font-size: 12px; margin-bottom: 5px;">Status</p>
              <span class="status-badge status-${shipment.status.toLowerCase().replace(/\s+/g, '-')}">${shipment.status}</span>
            </div>
          </div>
          <button class="btn btn-primary" onclick="viewTrackingDetails('${shipment.id}')" style="width: 100%; justify-content: center;">View Full Details</button>
        </div>
      `).join('');
    }

    // ===== TRACKING DETAILS =====
    function viewTrackingDetails(shipmentId) {
      const shipment = createdShipments.find(s => s.id === shipmentId);
      if (!shipment) return;

      currentShipmentForTracking = shipment;

      document.getElementById('trackingDetailsTitle').textContent = `Shipment ${shipmentId}`;
      document.getElementById('detailOrderId').textContent = shipment.orderId;
      document.getElementById('detailTrackingId').textContent = shipment.trackingId || 'Not uploaded yet';
      document.getElementById('detailPartner').textContent = shipment.partner;
      document.getElementById('detailStatus').innerHTML = `<span class="status-badge status-${shipment.status.toLowerCase().replace(/\s+/g, '-')}">${shipment.status}</span>`;
      document.getElementById('internalNotes').value = shipment.internalNotes;

      renderTrackingTimeline();
      document.getElementById('trackingDetailsModal').classList.add('active');
    }

    function closeTrackingDetailsModal() {
      document.getElementById('trackingDetailsModal').classList.remove('active');
    }

    function renderTrackingTimeline() {
      const timeline = document.getElementById('trackingTimeline');
      const statuses = ['Pending', 'In Transit', 'Out for Delivery', 'Delivered'];
      const currentStatus = currentShipmentForTracking.status;
      const currentIndex = statuses.indexOf(currentStatus);

      timeline.innerHTML = statuses.map((status, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = status === currentStatus;
        const isDue = index > currentIndex;

        let dotClass = '';
        if (isCompleted) dotClass = 'completed';
        if (isCurrent) dotClass = 'active';

        const icon = {
          'Pending': '📦',
          'In Transit': '🚚',
          'Out for Delivery': '🚪',
          'Delivered': '✅'
        }[status];

        return `
          <div class="timeline-item ${isCurrent ? 'active' : ''}">
            <div class="timeline-dot ${dotClass}"></div>
            <div class="timeline-content">
              <h4>${icon} ${status}</h4>
              <p>${isCompleted || isCurrent ? 'Completed' : 'Pending'}</p>
            </div>
          </div>
        `;
      }).join('');
    }

    function saveInternalNotes() {
      if (currentShipmentForTracking) {
        currentShipmentForTracking.internalNotes = document.getElementById('internalNotes').value;
        showConfirmation('✅ Notes Saved', 'Internal notes have been saved successfully.');
      }
    }

    // ===== CONFIRMATION MODAL =====
    function showConfirmation(title, message, callback) {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      confirmCallback = callback;
      document.getElementById('confirmationModal').classList.add('active');
    }

    function closeConfirmationModal() {
      document.getElementById('confirmationModal').classList.remove('active');
    }

    function confirmAction() {
      if (confirmCallback) confirmCallback();
      closeConfirmationModal();
    }

    // ===== EXPORT FUNCTIONS TO WINDOW =====
    // Make all functions accessible from onclick handlers when loaded via fetch/eval
    window.initializeDeliveryPanel = initializeDeliveryPanel;
    window.switchTab = switchTab;
    window.selectPartner = selectPartner;
    window.openCreateShipmentModal = openCreateShipmentModal;
    window.closeCreateShipmentModal = closeCreateShipmentModal;
    window.createShipment = createShipment;
    window.openTrackingIdModal = openTrackingIdModal;
    window.closeTrackingIdModal = closeTrackingIdModal;
    window.uploadTrackingId = uploadTrackingId;
    window.viewTrackingDetails = viewTrackingDetails;
    window.closeTrackingDetailsModal = closeTrackingDetailsModal;
    window.saveInternalNotes = saveInternalNotes;
    window.showConfirmation = showConfirmation;
    window.closeConfirmationModal = closeConfirmationModal;
    window.confirmAction = confirmAction;
