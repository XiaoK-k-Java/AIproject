import java.util.*;
public class lk05 {
    public static void main(String[] args) {
        // 测试用例1
        String[] strs1 = {"eat", "tea", "tan", "ate", "nat", "bat"};
        System.out.println(groupAnagrams(strs1));

        // 测试用例2
        String[] strs2 = {""};
        System.out.println(groupAnagrams(strs2));

        // 测试用例3
        String[] strs3 = {"a"};
        System.out.println(groupAnagrams(strs3));
    }

    public static List<List<String>> groupAnagrams(String[] strs) {
        // key：排序后的字符串（异位词排序后相同），value：同组异位词列表
        Map<String, List<String>> map = new HashMap<>();
        for (String s : strs) {
            char[] arr = s.toCharArray();
            Arrays.sort(arr);
            String key = new String(arr);
            map.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(map.values());
    }
}
