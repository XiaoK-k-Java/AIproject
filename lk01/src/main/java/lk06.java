import java.util.HashSet;
import java.util.Set;

public class lk06 {
    public static void main(String[] args) {
        // 测试示例
        int[] nums1 = {100,4,200,1,3,2};
        int[] nums2 = {0,3,7,2,5,8,4,6,0,1};
        int[] nums3 = {1,0,1,2};

        System.out.println(longestConsecutive(nums1)); // 输出4
        System.out.println(longestConsecutive(nums2)); // 输出9
        System.out.println(longestConsecutive(nums3)); // 输出3
    }

    public static int longestConsecutive(int[] nums) {
        Set<Integer> set = new HashSet<>();
        // 全部放入set去重
        for(int num : nums){
            set.add(num);
        }
        int maxLen = 0;

        for(int num : set){
            // 如果 num-1 不在集合，说明num是序列起点
            if(!set.contains(num - 1)){
                int curNum = num;
                int curLen = 1;
                // 不断往后找连续数字
                while(set.contains(curNum + 1)){
                    curNum++;
                    curLen++;
                }
                maxLen = Math.max(maxLen, curLen);
            }
        }
        return maxLen;
    }
}
