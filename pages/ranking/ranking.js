const userActionTracker = require('../../utils/userActionTracker.js');

Page({
  data: {
    loading: true,
    loadingText: '正在加载排名数据...',
    rankingList: [],
    myRanking: null,
  },

  onLoad: function (options) {
    this.loadRankingData();
  },

  onShow: function () {
    const app = getApp();
    
    if (!app.globalData.openid) {
      console.warn('[排行榜] 用户未登录，跳转到登录页面');
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    
    if (!app.globalData.userData) {
      console.warn('[排行榜] 用户数据未加载，尝试加载数据');
      app.loadUserData().then(() => {
        this.checkUserProfile();
        this.loadRankingData();
      }).catch(error => {
        console.error('[排行榜] 用户数据加载失败:', error);
        wx.showToast({
          title: '数据加载失败',
          icon: 'none'
        });
        wx.navigateTo({ url: '/pages/login/login' });
      });
      return;
    }
    
    this.checkUserProfile();
    this.loadRankingData();
    userActionTracker.track('进入排名页面');
  },

  /**
   * 检查用户资料完整性
   */
  checkUserProfile: async function() {
    const app = getApp();
    
    // 检查是否已经设置了用户资料
    if (app.globalData.userData && app.globalData.userData.profile) {
      const profile = app.globalData.userData.profile;
      if (profile.nickname && profile.avatar) {
        return;
      }
    }
    
    // 首次参与排名，提示设置资料
    wx.showModal({
      title: '参与排名',
      content: '首次参与排名需要设置头像和昵称，让其他用户认识您！',
      confirmText: '去设置',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/profile/profile?from=ranking'
          });
        }
      }
    });
  },

  /**
   * 加载排行榜数据
   */
  loadRankingData: async function() {
    this.setData({ 
      loading: true,
      loadingText: '正在获取排名数据...'
    });
    
    try {
      // 从云端获取排行榜数据
      const rankingData = await this.fetchRankingFromCloud();
      
      if (rankingData && rankingData.length > 0) {
        // 处理排行榜数据
        const processedList = await this.processRankingData(rankingData);
        
        // 查找当前用户的排名
        const myRanking = this.findMyRanking(processedList);
        
        this.setData({
          rankingList: processedList,
          myRanking: myRanking,
          loading: false,
          loadingText: '加载完成'
        });
        
      } else {
        this.setData({
          rankingList: [],
          myRanking: null,
          loading: false,
          loadingText: '暂无数据'
        });
        
        wx.showToast({
          title: '暂无排行榜数据',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载排行榜数据失败:', error);
      this.setData({ 
        loading: false,
        loadingText: '加载失败'
      });
    }
  },

  /**
   * 处理排行榜数据 - 前端负责所有数据处理逻辑
   */
  processRankingData: async function(rawData) {
    const app = getApp();
    const currentUserOpenid = app.globalData.openid;
    
    
    
    const processedData = rawData.map((item, index) => {
      const userOpenid = item._openid;
      const isCurrentUser = userOpenid === currentUserOpenid;
      
      // 从原始数据中提取核心字段
      const totalAssets = item.totalAmount || 0;
      const profitRate = item.totalProfitRate || 0;
      
      // 处理用户显示信息 - 前端负责格式化逻辑
      let displayNickname = '匿名用户';
      let displayAvatar = '';
      
      if (item.profile && item.profile.nickname && item.profile.avatar) {
        displayNickname = item.profile.nickname;
        displayAvatar = item.profile.avatar;
      }

      return {
        rank: index + 1,
        openid: userOpenid,
        nickname: displayNickname,
        avatar: displayAvatar,
        isCurrentUser: isCurrentUser,
        totalAssets: parseFloat(totalAssets.toFixed(2)),
        profitRate: parseFloat(profitRate.toFixed(2)),
        hasCustomProfile: !!(item.profile && item.profile.nickname && item.profile.avatar)
      };
    });

    
    return processedData;
  },

  /**
   * 从云端获取排行榜数据
   */
  fetchRankingFromCloud: async function() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'getRanking',
        data: {
          limit: 100
        }
      });

      if (result.result && result.result.success) {
        return result.result.data;
      } else {
        throw new Error(result.result?.error || '获取排行榜数据失败');
      }
    } catch (error) {
      console.error('云端获取排行榜失败:', error);
      
      wx.showModal({
        title: '获取排行榜失败',
        content: `错误详情: ${error.message || error}`,
        showCancel: false,
        confirmText: '确定'
      });
      
      return [];
    }
  },

  /**
   * 查找当前用户的排名
   */
  findMyRanking: function(processedList) {
    const app = getApp();
    const currentUserOpenid = app.globalData.openid;
    
    if (!currentUserOpenid) {
      console.warn('[排行榜] 无法找到当前用户openid');
      return null;
    }
    
    const myData = processedList.find(item => item.openid === currentUserOpenid);
    if (!myData) {
      console.warn('[排行榜] 在排行榜中未找到当前用户数据');
    }
    
    return myData || null;
  },

  /**
   * 刷新排行榜
   */
  refreshRanking: function() {
    this.setData({
      loading: true,
      loadingText: '正在刷新...'
    });
    
    this.loadRankingData();
  },

  /**
   * 返回上一页
   */
  goBack: function() {
    wx.navigateBack({
      delta: 1
    });
  },

  /**
   * 页面分享配置
   */
  onShareAppMessage: function() {
    return {
      title: '投资排行榜 - 看看谁是投资高手！',
      path: '/pages/ranking/ranking',
      imageUrl: '/images/share-ranking.png'
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function() {
    return {
      title: '投资排行榜 - 养基高手',
      imageUrl: '/images/share-ranking.png'
    };
  },

  /**
   * 头像加载失败处理
   */
  onAvatarError: function(e) {
    const openid = e.currentTarget.dataset.openid;
    console.warn('头像加载失败:', openid);
    
    const targetItem = this.data.rankingList.find(item => item.openid === openid);
    if (targetItem) {
      targetItem.avatar = '';
      this.setData({
        rankingList: this.data.rankingList
      });
    }
  }
}); 