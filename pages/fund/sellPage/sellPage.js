Page({
  data: {
    currentNetValue_raw: 0, // Raw
    fundUnits_raw: 0,       // Raw
    currentNetValue_display: '0.0000', // Formatted
    fundUnits_display: '0.00',       // Formatted
    inputUnits: '', // This will hold the string representation for the input field
    estimatedAmount_display: '0.00', // Formatted
    isSellingAll: false    // Flag to indicate if user clicked "sell all"
  },

  onLoad: function(options) {
    const currentNetValue_raw = parseFloat(options.netValue || 0);
    const fundUnits_raw = parseFloat(options.fundUnits || 0);
    const fundUnits_display = fundUnits_raw.toFixed(2);
    
    this.setData({
      currentNetValue_raw,
      fundUnits_raw,
      currentNetValue_display: currentNetValue_raw.toFixed(4),
      fundUnits_display: fundUnits_display 
    });
  },
  
  onInputUnitsChange: function(e) {
    const inputUnitsStr = e.detail.value;
    let estimatedAmount_raw = 0;
    const inputUnitsNum = parseFloat(inputUnitsStr);

    if (inputUnitsStr && !isNaN(inputUnitsNum) && this.data.currentNetValue_raw > 0) {
      estimatedAmount_raw = (inputUnitsNum * this.data.currentNetValue_raw);
    }
    
    this.setData({
      inputUnits: inputUnitsStr, // Store the input as string
      estimatedAmount_display: estimatedAmount_raw.toFixed(2),
      isSellingAll: false // Reset flag when user manually changes input
    });
  },

  /**
   * 快捷卖出操作
   * @param {Event} e 事件对象，包含仓位比例数据
   */
  onQuickSell: function(e) {
    const ratio = parseFloat(e.currentTarget.dataset.ratio);
    const fundUnits_raw = this.data.fundUnits_raw;
    const currentNetValue_raw = this.data.currentNetValue_raw;
    
    if (!ratio || fundUnits_raw <= 0 || currentNetValue_raw <= 0) {
      wx.showToast({
        title: '数据异常',
        icon: 'none'
      });
      return;
    }
    
    // 计算按比例卖出的份额
    const sellUnits = fundUnits_raw * ratio;
    const estimatedAmount = sellUnits * currentNetValue_raw;
    
    // 格式化显示
    const displayUnits = sellUnits.toFixed(2);
    const displayAmount = estimatedAmount.toFixed(2);
    const isSellingAll = ratio >= 0.99;
    
    this.setData({
      inputUnits: displayUnits,
      estimatedAmount_display: displayAmount,
      isSellingAll: isSellingAll // 如果比例接近1，标记为全仓卖出
    });
  },

  onSellAll: function() {
    // 保留原有的全部卖出功能，现在通过快捷按钮实现
    this.onQuickSell({
      currentTarget: {
        dataset: { ratio: '1' }
      }
    });
  },
  
  onCancel: function() {
    wx.navigateBack();
  },
  
  onConfirm: function() {
    const { inputUnits, fundUnits_raw, fundUnits_display, isSellingAll } = this.data;
    
    let unitsToSell;
    let isClearingPosition = false; // 是否为清仓操作
    
    // 验证输入
    const inputValue = parseFloat(inputUnits);
    
    if (isNaN(inputValue) || inputValue <= 0) {
      wx.showToast({
        title: '请输入有效份额',
        icon: 'none'
      });
      return;
    }
    
    // 判断是否为清仓操作
    if (isSellingAll || inputUnits === fundUnits_display) {
      // 情况1：点击了"全部卖出"按钮
      // 情况2：手动输入的份额与可用余额显示值一致
      isClearingPosition = true;
      unitsToSell = fundUnits_raw; // 清仓时使用原始精确数值
    } else {
      // 普通卖出操作
      unitsToSell = inputValue;
      
      // 检查是否有足够的份额
      if (unitsToSell > fundUnits_raw + 0.01) { // 允许0.01份额的误差范围
        wx.showToast({
          title: '份额不足',
          icon: 'none'
        });
        return;
      }
    }
    
    // 返回上一页并传递数据
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2]; 
    
    prevPage.sellConfirm(unitsToSell); // Pass the precise number user intends to sell
    
    wx.navigateBack();
  }
}) 