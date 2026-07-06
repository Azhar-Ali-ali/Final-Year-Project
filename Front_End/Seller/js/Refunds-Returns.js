
    // ===== DUMMY DATA =====
    const dummyReturns = [
      {
        id: 'RET-001',
        orderId: 'ORD-001',
        customer: 'John Doe',
        email: 'john@example.com',
        phone: '+1 (555) 123-4567',
        product: 'Wireless Headphones',
        price: 89.99,
        dateRequested: '2025-11-22',
        reason: 'The headphones stopped working after 2 days. The left ear is not producing any sound.',
        refund: 89.99,
        status: 'Pending',
        timeline: ['Requested'],
        images: ['https://via.placeholder.com/100?text=Image+1', 'https://via.placeholder.com/100?text=Image+2']
      },
      {
        id: 'RET-002',
        orderId: 'ORD-002',
        customer: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+1 (555) 234-5678',
        product: 'USB-C Cable',
        price: 15.99,
        dateRequested: '2025-11-21',
        reason: 'Received wrong color. Ordered white but got black.',
        refund: 15.99,
        status: 'Approved',
        timeline: ['Requested', 'Approved'],
        images: ['https://via.placeholder.com/100?text=Cable']
      },
      {
        id: 'RET-003',
        orderId: 'ORD-003',
        customer: 'Mike Johnson',
        email: 'mike@example.com',
        phone: '+1 (555) 345-6789',
        product: 'Phone Case',
        price: 24.99,
        dateRequested: '2025-11-20',
        reason: 'Case is damaged - has cracks on the corner.',
        refund: 24.99,
        status: 'Approved',
        timeline: ['Requested', 'Approved', 'Completed'],
        images: []
      },
      {
        id: 'RET-004',
        orderId: 'ORD-004',
        customer: 'Sarah Williams',
        email: 'sarah@example.com',
        phone: '+1 (555) 456-7890',
        product: 'Screen Protector',
        price: 9.99,
        dateRequested: '2025-11-19',
        reason: 'Not compatible with my phone model.',
        refund: 0,
        status: 'Rejected',
        timeline: ['Requested', 'Rejected'],
        images: []
      },
      {
        id: 'RET-005',
        orderId: 'ORD-005',
        customer: 'Tom Brown',
        email: 'tom@example.com',
        phone: '+1 (555) 567-8901',
        product: 'Laptop Stand',
        price: 45.99,
        dateRequested: '2025-11-18',
        reason: 'Change of mind. Product is too heavy for my desk.',
        refund: 45.99,
        status: 'Pending',
        timeline: ['Requested'],
        images: ['https://via.placeholder.com/100?text=Stand']
      },
      {
        id: 'RET-006',
        orderId: 'ORD-006',
        customer: 'Lisa Anderson',
        email: 'lisa@example.com',
        phone: '+1 (555) 678-9012',
        product: 'Keyboard',
        price: 79.99,
        dateRequested: '2025-11-17',
        reason: 'Keys are not responding properly.',
        refund: 79.99,
        status: 'Pending',
        timeline: ['Requested'],
        images: []
      },
      {
        id: 'RET-007',
        orderId: 'ORD-007',
        customer: 'David Lee',
        email: 'david@example.com',
        phone: '+1 (555) 789-0123',
        product: 'Mouse Pad',
        price: 12.99,
        dateRequested: '2025-11-16',
        reason: 'Surface is slippery, mouse does not grip.',
        refund: 12.99,
        status: 'Completed',
        timeline: ['Requested', 'Approved', 'Completed'],
        images: ['https://via.placeholder.com/100?text=Mousepad']
      },
      {
        id: 'RET-008',
        orderId: 'ORD-008',
        customer: 'Emma Davis',
        email: 'emma@example.com',
        phone: '+1 (555) 890-1234',
        product: 'USB Hub',
        price: 34.99,
        dateRequested: '2025-11-15',
        reason: 'Only 2 out of 4 USB ports are working.',
        refund: 34.99,
        status: 'Approved',
        timeline: ['Requested', 'Approved'],
        images: []
      }
    ];

    // ===== STATE ===== 
    let returns = JSON.parse(JSON.stringify(dummyReturns));
    let filteredReturns = [...returns];
    let currentPage = 1;
    const itemsPerPage = 10;
    let currentReturnDetail = null;
    let pendingAction = null;

    // ===== DOM ELEMENTS =====
    // Old sidebar elements removed from HTML structure - commented out
    // const sidebar = document.querySelector('.sidebar');
    // const toggleBtn = document.getElementById('toggleBtn');
    // const closeBtn = document.getElementById('closeBtn');
    // const overlay = document.getElementById('overlay');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const returnsTableBody = document.getElementById('returnsTableBody');
    const detailModal = document.getElementById('detailModal');
    const confirmModal = document.getElementById('confirmModal');
    const modalClose = document.getElementById('modalClose');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const confirmClose = document.getElementById('confirmClose');

    // ===== SIDEBAR TOGGLE =====
    // Old sidebar code commented out - using inline sidebar toggle in HTML instead
    // if (toggleBtn && sidebar && overlay) {
    //   toggleBtn.addEventListener('click', () => {
    //     sidebar.classList.add('active');
    //     overlay.classList.add('active');
    //   });
    // }

    // if (closeBtn && sidebar && overlay) {
    //   closeBtn.addEventListener('click', () => {
    //     sidebar.classList.remove('active');
    //     overlay.classList.remove('active');
    //   });
    // }

    // if (overlay) {
    //   overlay.addEventListener('click', () => {
    //     if (sidebar) sidebar.classList.remove('active');
    //     overlay.classList.remove('active');
    //     if (detailModal) detailModal.classList.remove('active');
    //     if (confirmModal) confirmModal.classList.remove('active');
    //   });
    // }

    // ===== SEARCH & FILTER =====
    function applyFilters() {
      const searchTerm = searchInput.value.toLowerCase();
      const statusTerm = statusFilter.value;

      filteredReturns = returns.filter(ret => {
        const matchSearch = 
          ret.id.toLowerCase().includes(searchTerm) ||
          ret.orderId.toLowerCase().includes(searchTerm) ||
          ret.customer.toLowerCase().includes(searchTerm) ||
          ret.product.toLowerCase().includes(searchTerm);
        
        const matchStatus = statusTerm === '' || ret.status === statusTerm;

        return matchSearch && matchStatus;
      });

      currentPage = 1;
      renderReturnsTable();
      updateSummary();
    }

    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);

    // ===== RENDER TABLE =====
    function renderReturnsTable() {
      returnsTableBody.innerHTML = '';
      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const pageData = filteredReturns.slice(start, end);

      if (pageData.length === 0) {
        returnsTableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 40px; color: #999;">
              No return requests found
            </td>
          </tr>
        `;
        renderPagination();
        return;
      }

      pageData.forEach(ret => {
        const statusClass = `badge-${ret.status.toLowerCase()}`;
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><span class="return-id">${ret.id}</span></td>
          <td>${ret.orderId}</td>
          <td>${ret.customer}</td>
          <td>${ret.product}</td>
          <td>${ret.dateRequested}</td>
          <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ret.reason}">${ret.reason}</td>
          <td>$${ret.refund.toFixed(2)}</td>
          <td><span class="status-badge ${statusClass}">${ret.status}</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn-view" onclick="viewDetail('${ret.id}')">View</button>
            </div>
          </td>
        `;
        returnsTableBody.appendChild(row);
      });

      renderPagination();
    }

    // ===== PAGINATION =====
    function renderPagination() {
      const paginationDiv = document.getElementById('returnsPagination');
      paginationDiv.innerHTML = '';
      const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);

      const prevBtn = document.createElement('button');
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderReturnsTable();
        }
      });
      paginationDiv.appendChild(prevBtn);

      for (let i = 1; i <= totalPages; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.addEventListener('click', () => {
          currentPage = i;
          renderReturnsTable();
        });
        paginationDiv.appendChild(pageBtn);
      }

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderReturnsTable();
        }
      });
      paginationDiv.appendChild(nextBtn);
    }

    // ===== VIEW DETAIL =====
    function viewDetail(returnId) {
      currentReturnDetail = returns.find(r => r.id === returnId);
      if (!currentReturnDetail) return;

      // Populate modal
      document.getElementById('modalTitle').textContent = `Return Details - ${currentReturnDetail.id}`;
      document.getElementById('detailCustomer').textContent = currentReturnDetail.customer;
      document.getElementById('detailEmail').textContent = currentReturnDetail.email;
      document.getElementById('detailPhone').textContent = currentReturnDetail.phone;
      document.getElementById('detailOrderId').textContent = currentReturnDetail.orderId;
      document.getElementById('detailProduct').textContent = currentReturnDetail.product;
      document.getElementById('detailPrice').textContent = `$${currentReturnDetail.price.toFixed(2)}`;
      document.getElementById('detailReason').textContent = currentReturnDetail.reason;

      // Images
      const imagesDiv = document.getElementById('detailImages');
      imagesDiv.innerHTML = '';
      if (currentReturnDetail.images.length > 0) {
        currentReturnDetail.images.forEach(img => {
          const imgEl = document.createElement('img');
          imgEl.src = img;
          imgEl.style.width = '100px';
          imgEl.style.height = '100px';
          imgEl.style.borderRadius = '6px';
          imgEl.style.objectFit = 'cover';
          imagesDiv.appendChild(imgEl);
        });
      } else {
        imagesDiv.innerHTML = '<p style="color: #999;">No images uploaded</p>';
      }

      // Timeline
      renderTimeline(currentReturnDetail.status);

      // Refund calculator
      document.getElementById('calcPrice').value = currentReturnDetail.price.toFixed(2);
      document.getElementById('calcShipping').value = '0.00';
      document.getElementById('calcCommission').value = '5';
      document.getElementById('calcReturnFee').value = '0.00';
      updateCalculator();

      // Status update form
      const statusSelect = document.getElementById('returnStatusSelect');
      if (statusSelect) {
        statusSelect.value = currentReturnDetail.status;
      }
      const statusNotes = document.getElementById('returnStatusNotes');
      if (statusNotes) {
        statusNotes.value = '';
      }

      // Setup buttons
      document.getElementById('approveBtn').onclick = () => showConfirm('approve');
      document.getElementById('rejectBtn').onclick = () => showConfirm('reject');

      detailModal.classList.add('active');
      if (overlay) overlay.classList.add('active');
    }

    // ===== TIMELINE RENDER =====
    function renderTimeline(status) {
      const timelineDiv = document.getElementById('detailTimeline');
      if (!timelineDiv) return;
      timelineDiv.innerHTML = '';

      // Define all possible steps with descriptions
      const allSteps = [
        { label: 'Return Requested', key: 'Requested', description: 'Customer initiated return request' },
        { label: 'Under Review', key: 'Under Review', description: 'Seller reviewing return request' },
        { label: 'Approved', key: 'Approved', description: 'Return approved by seller' },
        { label: 'Rejected', key: 'Rejected', description: 'Return rejected by seller' },
        { label: 'Refund Completed', key: 'Completed', description: 'Refund processed and completed' }
      ];

      // Build steps to display based on status similar to order timeline
      let steps = [];
      steps.push(allSteps[0]); // Requested
      steps.push(allSteps[1]); // Under Review

      if (status === 'Rejected') {
        steps.push(allSteps[3]); // Rejected
      } else if (status === 'Approved' || status === 'Completed') {
        steps.push(allSteps[2]); // Approved
        if (status === 'Completed') steps.push(allSteps[4]); // Completed
      }

      // Render timeline items
      steps.forEach((step, idx) => {
        const timelineKeys = Array.isArray(currentReturnDetail.timeline) ? currentReturnDetail.timeline : [];
        const isCompleted = timelineKeys.includes(step.key);
        const isActive = step.key === status;
        const isCurrent = isActive && !isCompleted;

        const timelineItem = document.createElement('div');
        const statusClass = isCompleted ? 'completed' : (isCurrent ? 'active' : 'pending');
        timelineItem.className = `timeline-item ${statusClass}`;

        const dot = document.createElement('div');
        dot.className = `timeline-dot ${isCompleted ? 'completed' : ''}`;
        if (isActive && !isCompleted) {
          dot.textContent = '●';
        } else if (isCompleted) {
          // checkmark via CSS
        } else {
          dot.textContent = idx + 1;
        }
        timelineItem.appendChild(dot);

        // Timestamp handling: use requested date for the first step, otherwise fall back to today's date
        let timestamp = '';
        if (step.key === 'Requested' && currentReturnDetail.dateRequested) {
          timestamp = currentReturnDetail.dateRequested;
        } else if (isCompleted || isActive) {
          timestamp = new Date().toLocaleDateString();
        }

        const content = document.createElement('div');
        content.className = 'timeline-content';
        const statusText = isCompleted ? 'Completed' : (isActive ? 'In Progress' : 'Pending');
        content.innerHTML = `
          <h4>${step.label}</h4>
          <p>${step.description}</p>
          <div class="timeline-date">${statusText}${timestamp ? ' • ' + timestamp : ''}</div>
        `;
        timelineItem.appendChild(content);

        timelineDiv.appendChild(timelineItem);
      });
    }

    // ===== UPDATE RETURN STATUS =====
    window.updateReturnStatus = function updateReturnStatus() {
      if (!currentReturnDetail) return;

      const newStatus = document.getElementById('returnStatusSelect').value;
      const notes = document.getElementById('returnStatusNotes').value;

      // Update return status
      const returnIndex = returns.findIndex(r => r.id === currentReturnDetail.id);
      if (returnIndex !== -1) {
        const oldStatus = returns[returnIndex].status;
        returns[returnIndex].status = newStatus;
        
        // Add status steps to timeline based on progression
        if (newStatus === 'Under Review' && !returns[returnIndex].timeline.includes('Under Review')) {
          returns[returnIndex].timeline.push('Under Review');
        }
        
        if ((newStatus === 'Approved' || newStatus === 'Rejected') && !returns[returnIndex].timeline.includes(newStatus)) {
          returns[returnIndex].timeline.push(newStatus);
        }
        
        if (newStatus === 'Completed' && !returns[returnIndex].timeline.includes('Completed')) {
          returns[returnIndex].timeline.push('Completed');
        }
        
        currentReturnDetail = returns[returnIndex];

        // Refresh the modal display
        const returnDetail = returns[returnIndex];
        renderTimeline(returnDetail.status);

        // Update summary cards
        updateSummary();

        // Re-render table
        renderReturnsTable();

        // Show confirmation message with detailed info
        const action = newStatus === 'Approved' ? '✓ Approved' : 
                      newStatus === 'Rejected' ? '✗ Rejected' : 
                      newStatus === 'Under Review' ? '◊ Moved to Review' :
                      newStatus === 'Completed' ? '✓ Completed' : newStatus;
        
        alert(`Return ${action}!\n\n${notes ? 'Notes: ' + notes : 'No additional notes'}`);
        document.getElementById('returnStatusNotes').value = '';
      }
    };

    // ===== CALCULATOR =====
    ['calcPrice', 'calcShipping', 'calcCommission', 'calcReturnFee'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateCalculator);
    });

    function updateCalculator() {
      const price = parseFloat(document.getElementById('calcPrice').value) || 0;
      const commission = parseFloat(document.getElementById('calcCommission').value) || 0;
      const returnFee = parseFloat(document.getElementById('calcReturnFee').value) || 0;

      const commissionAmount = price * (commission / 100);
      const finalRefund = Math.max(0, price - commissionAmount - returnFee);

      document.getElementById('calcCommissionAmount').textContent = `$${commissionAmount.toFixed(2)}`;
      document.getElementById('calcReturnFeeAmount').textContent = `$${returnFee.toFixed(2)}`;
      document.getElementById('calcFinalRefund').textContent = `$${finalRefund.toFixed(2)}`;
    }

    // ===== CONFIRMATION =====
    function showConfirm(action) {
      pendingAction = action;
      const title = action === 'approve' ? 'Approve Return' : 'Reject Return';
      const message = action === 'approve' 
        ? `Are you sure you want to approve the return for ${currentReturnDetail.id}? The refund amount will be $${currentReturnDetail.refund.toFixed(2)}.`
        : `Are you sure you want to reject the return for ${currentReturnDetail.id}? This action cannot be undone.`;

      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      confirmModal.classList.add('active');
    }

    document.getElementById('confirmYes').addEventListener('click', () => {
      if (pendingAction === 'approve') {
        currentReturnDetail.status = 'Approved';
        currentReturnDetail.timeline.push('Approved');
      } else if (pendingAction === 'reject') {
        currentReturnDetail.status = 'Rejected';
        currentReturnDetail.timeline.push('Rejected');
      }

      confirmModal.classList.remove('active');
      detailModal.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      renderReturnsTable();
      updateSummary();

      alert(`Return ${pendingAction} successfully!`);
    });

    document.getElementById('confirmCancel').addEventListener('click', () => {
      confirmModal.classList.remove('active');
    });

    confirmClose.addEventListener('click', () => {
      confirmModal.classList.remove('active');
    });

    // ===== SUMMARY =====
    function updateSummary() {
      const pending = returns.filter(r => r.status === 'Pending').length;
      const approved = returns.filter(r => r.status === 'Approved').length;
      const rejected = returns.filter(r => r.status === 'Rejected').length;
      const totalRefunded = returns
        .filter(r => r.status === 'Completed')
        .reduce((sum, r) => sum + r.refund, 0);

      document.getElementById('pendingCount').textContent = pending;
      document.getElementById('approvedCount').textContent = approved;
      document.getElementById('rejectedCount').textContent = rejected;
      document.getElementById('totalRefunded').textContent = `$${totalRefunded.toFixed(2)}`;
    }

    // ===== MODAL CLOSE =====
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        if (detailModal) detailModal.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
      });
    }

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        if (detailModal) detailModal.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
      });
    }

    // ===== INIT =====
    function initializeRefundsReturns() {
      console.log('Initializing Refunds & Returns page');
      try {
        renderReturnsTable();
        updateSummary();
        console.log('Refunds & Returns initialized successfully');
      } catch (e) {
        console.error('Error initializing Refunds & Returns:', e);
      }
    }

    // Call immediately (for fetch/eval loading in index)
    initializeRefundsReturns();
    
    // Also call on DOMContentLoaded (for direct page load)
    document.addEventListener('DOMContentLoaded', initializeRefundsReturns);

    // ===== EXPORT FUNCTIONS TO WINDOW =====
    // Make all functions accessible from onclick handlers when loaded via fetch/eval
    window.viewDetail = viewDetail;
    window.applyFilters = applyFilters;
    window.updateSummary = updateSummary;
    window.renderReturnsTable = renderReturnsTable;
    window.renderPagination = renderPagination;
    window.renderTimeline = renderTimeline;
    window.updateCalculator = updateCalculator;
    window.showConfirm = showConfirm;
    window.initializeRefundsReturns = initializeRefundsReturns;
    window.updateReturnStatus = updateReturnStatus;
